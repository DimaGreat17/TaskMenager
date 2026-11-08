import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
const db = new PrismaClient();
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) throw new Error('Set ADMIN_USERNAME and a unique ADMIN_PASSWORD of at least 12 characters');
  if (await db.user.findUnique({where:{username}})) { console.log('Admin exists; not changing password'); return; }
  await db.user.create({data:{username,fullName:'Системный администратор',passwordHash:await argon2.hash(password),systemRole:'SUPER_ADMIN'}});
  console.log('Initial administrator created. Remove ADMIN_PASSWORD from the environment after setup.');
}
main().finally(()=>db.$disconnect());
