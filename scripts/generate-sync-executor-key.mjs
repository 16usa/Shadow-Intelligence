import { Keypair } from '@solana/web3.js';
const kp=Keypair.generate();
console.log('SYNC_EXECUTOR_FEE_PAYER_ADDRESS='+kp.publicKey.toBase58());
console.log('SYNC_EXECUTOR_FEE_PAYER_KEY='+Buffer.from(kp.secretKey).toString('base64'));
console.log('\nStore the KEY value in Replit Secrets. Fund only the ADDRESS with a small SOL fee balance; it never holds user trading funds.');
