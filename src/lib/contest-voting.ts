import { prisma } from '@/lib/prisma'

const DEFAULT_CONTESTANTS = [
  'Contestant 1',
  'Contestant 2',
  'Contestant 3',
  'Contestant 4',
  'Contestant 5',
]

export async function ensureContestVotingSession() {
  let session = await prisma.contestVotingSession.findFirst({
    where: {
      isOpen: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      contestants: {
        where: {
          isActive: true,
        },
        orderBy: {
          displayOrder: 'asc',
        },
      },
    },
  })

  if (!session) {
    session = await prisma.contestVotingSession.create({
      data: {
        title: 'Contest Voting',
        isOpen: true,
        contestants: {
          create: DEFAULT_CONTESTANTS.map((name, index) => ({
            name,
            displayOrder: index + 1,
            isActive: true,
          })),
        },
      },
      include: {
        contestants: {
          where: {
            isActive: true,
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    })
  }

  if (session.contestants.length === 0) {
    await prisma.contestContestant.createMany({
      data: DEFAULT_CONTESTANTS.map((name, index) => ({
        sessionId: session!.id,
        name,
        displayOrder: index + 1,
        isActive: true,
      })),
    })

    session = await prisma.contestVotingSession.findUnique({
      where: {
        id: session.id,
      },
      include: {
        contestants: {
          where: {
            isActive: true,
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    })

    if (!session) {
      throw new Error('Contest voting session could not be loaded after creating contestants.')
    }
  }

  return session
}

export async function getContestVotingResults() {
  const session = await ensureContestVotingSession()

  const groupedVotes = await prisma.contestVote.groupBy({
    by: ['contestantId'],
    where: {
      sessionId: session.id,
    },
    _count: {
      contestantId: true,
    },
  })

  const voteCountByContestant = new Map(
    groupedVotes.map((row) => [row.contestantId, row._count.contestantId])
  )

  const contestants = session.contestants.map((contestant) => ({
    id: contestant.id,
    name: contestant.name,
    displayOrder: contestant.displayOrder,
    voteCount: voteCountByContestant.get(contestant.id) || 0,
  }))

  const totalVotes = contestants.reduce(
    (sum, contestant) => sum + contestant.voteCount,
    0
  )

  return {
    session: {
      id: session.id,
      title: session.title,
      isOpen: session.isOpen,
    },
    contestants,
    totalVotes,
  }
}