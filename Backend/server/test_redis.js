require('dotenv').config();
const { cache, redis } = require('./config/redis');

async function test() {
  console.log("Redis instance:", !!redis);
  if (!redis) {
    console.log("No redis configured. Check environment variables.");
    console.log("UPSTASH_REDIS_REST_URL:", process.env.UPSTASH_REDIS_REST_URL);
    console.log("UPSTASH_REDIS_REST_TOKEN:", !!process.env.UPSTASH_REDIS_REST_TOKEN);
    return;
  }
  
  console.log("Testing ping...");
  const p = await cache.ping();
  console.log("Ping result:", p);
  
  console.log("Testing set...");
  const s = await cache.set("test-key", "test-val", 60);
  console.log("Set result:", s);
  
  console.log("Testing get...");
  const g = await cache.get("test-key");
  console.log("Get result:", g);
}

test().catch(console.error);
