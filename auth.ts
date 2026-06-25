import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { connectDB } from '@/lib/mongodb'
import { User } from '@/lib/models/User'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
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
