import mongoose, { Schema, Document } from 'mongoose'

export interface ITripMember {
  userId: mongoose.Types.ObjectId
  name: string
  email: string
  image?: string
  addedAt: Date
}

export interface ITrip extends Document {
  _id: mongoose.Types.ObjectId
  ownerId: mongoose.Types.ObjectId
  ownerName: string
  ownerEmail: string
  shareToken: string          // random token for invite link
  members: ITripMember[]
  title: string               // e.g. "Northville → Pictured Rocks"
  // Full trip state (mirrors TripContext state)
  stops: unknown[]
  routeGeometry: unknown | null
  totalDistance: string | null
  totalDuration: string | null
  hotelsByCity: Record<string, unknown>
  attractionsByCity: Record<string, unknown>
  surroundingsByCity: Record<string, unknown>
  confirmedReservations: unknown[]
  planActivities: unknown[]
  updatedAt: Date
  createdAt: Date
}

const TripSchema = new Schema<ITrip>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName: { type: String, required: true },
  ownerEmail: { type: String, required: true },
  shareToken: { type: String, required: true, unique: true, index: true },
  members: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    image: String,
    addedAt: { type: Date, default: Date.now },
  }],
  title: { type: String, default: 'New Trip' },
  stops: { type: Schema.Types.Mixed, default: [] },
  routeGeometry: { type: Schema.Types.Mixed, default: null },
  totalDistance: { type: String, default: null },
  totalDuration: { type: String, default: null },
  hotelsByCity: { type: Schema.Types.Mixed, default: {} },
  attractionsByCity: { type: Schema.Types.Mixed, default: {} },
  surroundingsByCity: { type: Schema.Types.Mixed, default: {} },
  confirmedReservations: { type: Schema.Types.Mixed, default: [] },
  planActivities: { type: Schema.Types.Mixed, default: [] },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
})

TripSchema.pre('save', function() { this.updatedAt = new Date() })

export const Trip = mongoose.models.Trip || mongoose.model<ITrip>('Trip', TripSchema)
