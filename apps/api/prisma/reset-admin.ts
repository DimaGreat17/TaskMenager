import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const db = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.TASKBOARD_NEW_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('New administrator password must contain at least 12 characters.');
  }
  const user = await db.user.findUnique({ where: { username } });
  if (!user || user.systemRole !== 'SUPER_ADMIN') {
    throw new Error('Super administrator account not found. No changes made.');
  }
  const passwordHash = await argon2.hash(password);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash, isActive: true } }),
    db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  console.log('Administrator password updated. All existing administrator sessions revoked.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : 'Password reset failed');
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
