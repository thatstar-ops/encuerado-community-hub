import { prisma } from '@/lib/prisma'

/**
 * Returns true if the member has any ParticipationRecord
 * where source = 'TicketSpice' (i.e. was processed from a webhook).
 */
export async function hasTicketSpiceSource(memberId: string): Promise<boolean> {
  const count = await prisma.participationRecord.count({
    where: {
      memberId,
      source: 'TicketSpice',
    },
  })
  return count > 0
}
