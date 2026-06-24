import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId
  name: string
  email: string
  image?: string
  emailVerified?: Date
  accounts?: Array<{ provider: string; providerAccountId: string }>
  sessions?: Array<{ sessionToken: string; expires: Date }>
  createdAt: Date
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  image: String,
  emailVerified: Date,
  accounts: [{ provider: String, providerAccountId: String }],
  sessions: [{ sessionToken: String, expires: Date }],
  createdAt: { type: Date, default: Date.now },
})

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
