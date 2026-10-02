import assert from 'node:assert/strict';
function allowBuy({trade,daily,spent,maxTrade}){return trade>0&&trade<=maxTrade&&spent+trade<=daily}
function allowSell({amount,balance,bps}){return amount>0&&amount<=Math.floor(balance*bps/10000)}
assert.equal(allowBuy({trade:10,daily:100,spent:0,maxTrade:10}),true);
assert.equal(allowBuy({trade:11,daily:100,spent:0,maxTrade:10}),false);
assert.equal(allowBuy({trade:10,daily:15,spent:10,maxTrade:10}),false);
assert.equal(allowSell({amount:50,balance:100,bps:5000}),true);
assert.equal(allowSell({amount:51,balance:100,bps:5000}),false);
console.log('SHADOW_DELEGATED_POLICY_MODEL_OK');
