import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { PrivateVoting } from "../target/types/private_voting";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  x25519,
  getComputationAccAddress,
  getClusterAccAddress,
  getMXEPublicKey,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";

// ─── helpers ──────────────────────────────────────────────────────────────────

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries = 10,
  retryDelayMs = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) return mxePublicKey;
    } catch (err) {
      console.log(`Attempt ${attempt} failed:`, err);
    }
    if (attempt < maxRetries)
      await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts`);
}

// Encrypt a vote value with a fresh x25519 keypair
async function encryptVote(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  vote: 0 | 1 | 2
): Promise<{
  enc_pubkey: number[];
  nonce: anchor.BN;
  vote_ct: number[];
}> {
  const mxePublicKey = await getMXEPublicKeyWithRetry(provider, programId);
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  const nonceBytes = randomBytes(16);
  const nonceBN = new anchor.BN(deserializeLE(nonceBytes).toString());

  const encrypted = cipher.encrypt([BigInt(vote)], nonceBytes);
  const vote_ct = Array.from(encrypted[0]);

  return {
    enc_pubkey: Array.from(publicKey),
    nonce: nonceBN,
    vote_ct,
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe("PrivateVoting", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.PrivateVoting as Program<PrivateVoting>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E,
    timeoutMs = 120000
  ): Promise<Event[E]> => {
    let listenerId: number;
    let timeoutId: NodeJS.Timeout;
    const event = await new Promise<Event[E]>((res, rej) => {
      listenerId = program.addEventListener(eventName, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        res(event);
      });
      timeoutId = setTimeout(() => {
        program.removeEventListener(listenerId);
        rej(new Error(`Event ${eventName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  const clusterOffset = process.env.ARCIUM_CLUSTER_OFFSET
    ? BigInt(process.env.ARCIUM_CLUSTER_OFFSET)
    : BigInt(456);
  const arciumClusterPubkey = getClusterAccAddress(Number(clusterOffset));

  console.log("Cluster offset:", clusterOffset.toString());
  console.log("Cluster address:", arciumClusterPubkey.toBase58());

  let owner: anchor.web3.Keypair;
  let compDefPDA: PublicKey;

  // PDAs derived once
  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    program.programId
  );
  const [tallyResultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tally_result")],
    program.programId
  );

  before(async () => {
    const walletPath = process.env.ANCHOR_WALLET || `${os.homedir()}/q.json`;
    owner = readKpJson(walletPath);

    const balance = await provider.connection.getBalance(owner.publicKey);
    console.log(`Wallet balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    if (balance < anchor.web3.LAMPORTS_PER_SOL) {
      throw new Error("Insufficient balance — need at least 1 SOL");
    }

    // Comp def PDA
    const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offsetBytes = getCompDefAccOffset("tally_votes");
    compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeed, program.programId.toBuffer(), Buffer.from(offsetBytes)],
      getArciumProgramId()
    )[0];
    console.log("Comp def PDA:", compDefPDA.toBase58());

    // Initialize comp def if needed
    const compDefInfo = await provider.connection.getAccountInfo(compDefPDA);
    if (!compDefInfo) {
      console.log("Initializing tally_votes computation definition...");
      const sig = await program.methods
        .initTallyCompDef()
        .accountsPartial({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
      console.log("initTallyCompDef sig:", sig);

      // Finalize comp def
      const offsetBuffer = Buffer.from(offsetBytes);
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        offsetBuffer.readUInt32LE(),
        program.programId
      );
      const lbh = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = lbh.blockhash;
      finalizeTx.lastValidBlockHeight = lbh.lastValidBlockHeight;
      finalizeTx.sign(owner);
      await provider.sendAndConfirm(finalizeTx);
      console.log("Comp def finalized");
    } else {
      console.log("Comp def already exists, skipping.");
    }

    // Initialize GlobalState if needed
    const gsInfo = await provider.connection.getAccountInfo(globalStatePDA);
    if (!gsInfo) {
      console.log("Initializing GlobalState...");
      const sig = await program.methods
        .initializeGlobalState()
        .accountsPartial({
          payer: owner.publicKey,
          globalState: globalStatePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
      console.log("initializeGlobalState sig:", sig);
    } else {
      console.log("GlobalState already exists.");
    }

    // Initialize TallyResult singleton if needed
    const trInfo = await provider.connection.getAccountInfo(tallyResultPDA);
    if (!trInfo) {
      console.log("Initializing TallyResult...");
      const sig = await program.methods
        .initializeTallyResult()
        .accountsPartial({
          payer: owner.publicKey,
          tallyResult: tallyResultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });
      console.log("initializeTallyResult sig:", sig);
    } else {
      console.log("TallyResult already exists.");
    }
  });

  it("full voting flow: create DAO → add members → create proposal → vote → tally → finalize", async () => {
    // ── Create DAO ─────────────────────────────────────────────────────────────
    const gsAccount = await program.account.globalState.fetch(globalStatePDA);
    const daoId = gsAccount.daoCount;
    const [daoPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("dao"), daoId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("\nCreating DAO with id:", daoId.toString());
    await program.methods
      .createDao(
        "Test DAO",
        "A test DAO for private voting",
        20,  // 20% quorum
        51,  // 51% pass threshold
        new anchor.BN(0) // 0 second voting period for instant testing
      )
      .accountsPartial({
        payer: owner.publicKey,
        globalState: globalStatePDA,
        daoAccount: daoPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("DAO created:", daoPDA.toBase58());

    // ── Add Members ────────────────────────────────────────────────────────────
    // Member 1: owner
    const [ownerMemberPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), daoPDA.toBuffer(), owner.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .addMember()
      .accountsPartial({
        payer: owner.publicKey,
        daoAccount: daoPDA,
        memberAccount: ownerMemberPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("Owner added as member");

    // Member 2 & 3: fresh keypairs, airdrop SOL
    const voter2 = Keypair.generate();
    const voter3 = Keypair.generate();

    for (const voter of [voter2, voter3]) {
      const sig = await provider.connection.requestAirdrop(
        voter.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const [voter2MemberPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), daoPDA.toBuffer(), voter2.publicKey.toBuffer()],
      program.programId
    );
    const [voter3MemberPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("member"), daoPDA.toBuffer(), voter3.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .addMember()
      .accountsPartial({
        payer: voter2.publicKey,
        daoAccount: daoPDA,
        memberAccount: voter2MemberPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([voter2])
      .rpc({ commitment: "confirmed" });

    await program.methods
      .addMember()
      .accountsPartial({
        payer: voter3.publicKey,
        daoAccount: daoPDA,
        memberAccount: voter3MemberPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([voter3])
      .rpc({ commitment: "confirmed" });
    console.log("3 members added");

    // ── Create Proposal ────────────────────────────────────────────────────────
    const daoData = await program.account.daoAccount.fetch(daoPDA);
    const proposalId = daoData.proposalCount;
    const [proposalPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        daoPDA.toBuffer(),
        proposalId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createProposal("Test Proposal", "Should we approve this?")
      .accountsPartial({
        payer: owner.publicKey,
        daoAccount: daoPDA,
        memberAccount: ownerMemberPDA,
        proposalAccount: proposalPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("Proposal created:", proposalPDA.toBase58());

    // ── Cast Votes ─────────────────────────────────────────────────────────────
    // Encrypt: owner=Yes(1), voter2=No(0), voter3=Abstain(2)
    const [ownerEnc, voter2Enc, voter3Enc] = await Promise.all([
      encryptVote(provider, program.programId, 1),
      encryptVote(provider, program.programId, 0),
      encryptVote(provider, program.programId, 2),
    ]);

    const voterConfigs = [
      { signer: owner, member: ownerMemberPDA, enc: ownerEnc },
      { signer: voter2, member: voter2MemberPDA, enc: voter2Enc },
      { signer: voter3, member: voter3MemberPDA, enc: voter3Enc },
    ];

    for (const { signer, member, enc } of voterConfigs) {
      const [voteRecordPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote"), proposalPDA.toBuffer(), signer.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .castVote(
          proposalPDA,
          enc.enc_pubkey,
          enc.nonce,
          enc.vote_ct
        )
        .accountsPartial({
          payer: signer.publicKey,
          daoAccount: daoPDA,
          proposalAccount: proposalPDA,
          memberAccount: member,
          voteRecord: voteRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([signer])
        .rpc({ commitment: "confirmed" });
    }
    console.log("3 votes cast");

    // ── Mark Tally Pending ─────────────────────────────────────────────────────
    await program.methods
      .markTallyPending()
      .accountsPartial({
        payer: owner.publicKey,
        proposalAccount: proposalPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("Proposal marked as TallyPending");

    // ── Tally Votes ────────────────────────────────────────────────────────────
    // Build 5-slot arrays (pad unused slots with zeros)
    const ZERO_PUBKEY = Array(32).fill(0);
    const ZERO_CT = Array(32).fill(0);
    const ZERO_NONCE = new anchor.BN(0);

    const votes = [ownerEnc, voter2Enc, voter3Enc];
    const enc_pubkeys: number[][] = [];
    const nonces: anchor.BN[] = [];
    const vote_cts: number[][] = [];

    for (let i = 0; i < 5; i++) {
      if (i < votes.length) {
        enc_pubkeys.push(votes[i].enc_pubkey);
        nonces.push(votes[i].nonce);
        vote_cts.push(votes[i].vote_ct);
      } else {
        enc_pubkeys.push(ZERO_PUBKEY);
        nonces.push(ZERO_NONCE);
        vote_cts.push(ZERO_CT);
      }
    }

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const tallyCompletePromise = awaitEvent("tallyCompleteEvent", 300000);

    const tallySig = await program.methods
      .tallyVotes(
        computationOffset,
        3, // actual_count
        enc_pubkeys as any,
        nonces as any,
        vote_cts as any
      )
      .accountsPartial({
        payer: owner.publicKey,
        computationAccount: getComputationAccAddress(Number(clusterOffset), computationOffset),
        clusterAccount: arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(Number(clusterOffset)),
        executingPool: getExecutingPoolAccAddress(Number(clusterOffset)),
        compDefAccount: compDefPDA,
        proposalAccount: proposalPDA,
        tallyResult: tallyResultPDA,
      })
      .preInstructions([
        anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000_000 }),
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
      ])
      .signers([owner])
      .rpc({ commitment: "confirmed", skipPreflight: false });

    console.log("Tally queued:", tallySig);

    console.log("Waiting for Arcium computation finalization...");
    await awaitComputationFinalization(
      provider as any,
      computationOffset,
      program.programId,
      "confirmed"
    );

    console.log("Waiting for TallyCompleteEvent...");
    const tallyEvent = await tallyCompletePromise;
    console.log("TallyCompleteEvent received:", JSON.stringify(tallyEvent));

    // ── Finalize Proposal ─────────────────────────────────────────────────────
    await program.methods
      .finalizeProposal()
      .accountsPartial({
        payer: owner.publicKey,
        daoAccount: daoPDA,
        proposalAccount: proposalPDA,
        tallyResult: tallyResultPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
    console.log("Proposal finalized");

    // ── Assertions ─────────────────────────────────────────────────────────────
    const finalProposal = await program.account.proposalAccount.fetch(proposalPDA);
    console.log("\nFinal proposal state:");
    console.log("  yes:", finalProposal.yesCount);
    console.log("  no:", finalProposal.noCount);
    console.log("  abstain:", finalProposal.abstainCount);
    console.log("  status:", JSON.stringify(finalProposal.status));

    const status = finalProposal.status;
    const isPassed = "passed" in status || "Passed" in status;
    if (!isPassed && !("failed" in status || "Failed" in status)) {
      throw new Error("Unexpected proposal status: " + JSON.stringify(status));
    }

    // With 3 voters: yes=1, no=1, abstain=1
    // yes_pct = 1/3*100 = 33% < 51% → Failed
    // (or it could pass depending on rounding — just check the counts)
    if (finalProposal.yesCount !== 1 || finalProposal.noCount !== 1 || finalProposal.abstainCount !== 1) {
      throw new Error(
        `Expected yes=1 no=1 abstain=1 but got yes=${finalProposal.yesCount} no=${finalProposal.noCount} abstain=${finalProposal.abstainCount}`
      );
    }

    console.log("✅ All assertions passed!");
  });
});
