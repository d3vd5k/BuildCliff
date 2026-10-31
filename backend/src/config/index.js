import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Atlas or any replica-set Mongo. Falls back to local for development.
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/buildcliff?replicaSet=rs0',
  mongodbDb: process.env.MONGODB_DB || 'buildcliff',
  port: parseInt(process.env.PORT || '4000', 10),
};
