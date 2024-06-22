require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;

const mongoUri = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/?retryWrites=true&w=majority`;

let database;

async function connectDatabase() {
    try {
        const client = await MongoClient.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        database = client.db(mongodb_database);
        console.log('Connected to Database');
    } catch (error) {
        console.error('Error connecting to database:', error);
        throw error; // Handle this error appropriately in your application
    }
}

function getDatabase() {
    if (!database) {
        throw new Error('Database not initialized');
    }
    return database;
}

module.exports = { connectDatabase, getDatabase };
