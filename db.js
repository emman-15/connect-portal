const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let isConnected = false;

// Neon connection string is provided via DATABASE_URL environment variable
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    pool.on('error', (err) => {
        console.error('Unexpected error on idle Neon database client:', err.message);
    });
} else {
    console.warn('⚠️ No DATABASE_URL provided. App running in memory-fallback mode until Neon DATABASE_URL is set.');
}

async function initDb() {
    if (!pool) return false;

    try {
        const client = await pool.connect();
        try {
            // Create Users Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    first_name VARCHAR(100) NOT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    birthday VARCHAR(50),
                    gender VARCHAR(50),
                    coins INTEGER DEFAULT 1000,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                -- Ensure coins column exists if table was already created
                ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 1000;
            `);

            // Create Posts Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS posts (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    author_name VARCHAR(200) NOT NULL,
                    author_email VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    mood VARCHAR(100) DEFAULT '😊 Feeling Good',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create Likes Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS likes (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(post_id, user_id)
                );
            `);

            // Create Comments Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    author_name VARCHAR(200) NOT NULL,
                    text TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            console.log('✅ Connected to Neon PostgreSQL database and initialized tables successfully.');
            isConnected = true;
            return true;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Failed to connect to Neon database:', err.message);
        isConnected = false;
        return false;
    }
}

module.exports = {
    pool,
    initDb,
    isDbConnected: () => isConnected
};
