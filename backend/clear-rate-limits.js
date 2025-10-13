#!/usr/bin/env node
/**
 * Clear Rate Limit Blocks Script
 * Clears all rate limiting blocks from Redis
 */

const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
});

async function clearRateLimits() {
    try {
        console.log('Connecting to Redis...');

        // Find all rate limit keys
        const rateLimitKeys = await redis.keys('ratelimit:*');

        if (rateLimitKeys.length === 0) {
            console.log('No rate limit keys found.');
            redis.disconnect();
            return;
        }

        console.log(`Found ${rateLimitKeys.length} rate limit keys`);
        console.log('Sample keys:', rateLimitKeys.slice(0, 5));

        // Delete all rate limit keys
        const result = await redis.del(...rateLimitKeys);

        console.log(`Successfully cleared ${result} rate limit keys`);

        redis.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error clearing rate limits:', error);
        redis.disconnect();
        process.exit(1);
    }
}

clearRateLimits();
