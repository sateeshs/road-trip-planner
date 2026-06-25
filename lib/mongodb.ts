import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

let cached = (global as { mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } }).mongoose

if (!cached) {
  cached = (global as { mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } }).mongoose = { conn: null, promise: null }
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached!.conn) return cached!.conn
  if (!cached!.promise) {
    cached!.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false })
  }
  cached!.conn = await cached!.promise
  return cached!.conn
}
