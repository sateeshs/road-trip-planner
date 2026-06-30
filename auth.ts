import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { connectDB } from '@/lib/mongodb'
import { User } from '@/lib/models/User'

// Validate required Google OAuth env vars at request time (not build time).
// These are read lazily inside the provider so Next.js static analysis can
// still import auth.ts during build without throwing on missing CI secrets.
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set')
      }
      if (account?.provider === 'google') {
        try {
          await connectDB()
          const existing = await User.findOne({ email: user.email })
          if (!existing) {
            await User.create({
              name: user.name,
              email: user.email,
              image: user.image,
              accounts: [{ provider: account.provider, providerAccountId: account.providerAccountId }],
            })
          }
        } catch (err) {
          console.error('signIn DB error:', err)
          return false
        }
      }
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        try {
          await connectDB()
          const dbUser = await User.findOne({ email: session.user.email }).lean()
          if (dbUser) {
            (session.user as typeof session.user & { id: string }).id = (dbUser._id as { toString(): string }).toString()
          }
        } catch { /* non-fatal */ }
      }
      return session
    },
    async jwt({ token }) {
      return token
    },
  },
  pages: {
    signIn: '/',   // redirect back to app, show modal
  },
  secret: process.env.NEXTAUTH_SECRET,
})
