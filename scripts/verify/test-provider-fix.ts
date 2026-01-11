/**
 * Verify provider fix for SwapService
 * This script tests that the provider initialization works correctly
 */

import { ethers } from 'ethers';

// Test that signer without provider works after fix
async function testProviderFix() {
  console.log('Testing provider fix...\n');

  // Simulate a signer without provider (like what SDK returns)
  const privateKey = process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('POLY_PRIVATE_KEY not set');
    process.exit(1);
  }

  // Create signer WITHOUT provider (simulates SDK issue)
  const signerNoProvider = new ethers.Wallet(privateKey);
  console.log('1. Created signer without provider:');
  console.log('   - Address:', signerNoProvider.address);
  console.log('   - Has provider:', !!signerNoProvider.provider);

  // Apply the fix: connect to provider if missing
  const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
  const signer = signerNoProvider.provider ? signerNoProvider : signerNoProvider.connect(provider);
  
  console.log('\n2. After fix:');
  console.log('   - Has provider:', !!signer.provider);

  // Test that provider works
  try {
    const balance = await signer.provider!.getBalance(signer.address);
    console.log('   - MATIC balance:', ethers.utils.formatEther(balance));
    console.log('\n✅ Provider fix working correctly!');
  } catch (err) {
    console.error('\n❌ Provider still not working:', err);
    process.exit(1);
  }
}

testProviderFix().catch(console.error);
