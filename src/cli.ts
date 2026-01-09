import type { CAC } from 'cac'
import type {
  CommandOptions,
  GitHubStats,
  GitHubUser,
  Options,
  PullRequest,
} from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { resolveConfig } from './config'
import { NAME, VERSION } from './constants'
import { generate } from './generator'
import { getGraphQLStats, getPullRequests, getUser } from './git'
import { calculateRank } from './rank'

try {
  const cli: CAC = cac(NAME)

  cli
    .command('', 'Export GitHub stats and publish to a GitHub Gist')
    .option('--cwd <path>', 'Working directory')
    .option('--token <token>', 'GitHub token')
    .option('--api-version <version>', 'GitHub API version', { default: '2022-11-28' })
    .option('--per-page <count>', 'GitHub API per page count', { default: 50 })
    .option('--base-url <url>', 'GitHub base URL', { default: 'github.com' })
    .option('--gist-id <id>', 'GitHub Gist ID')
    .option('--gist-filename <filename>', 'GitHub Gist filename', { default: 'github-stats.json' })
    .allowUnknownOptions()
    .action(async (options: Partial<CommandOptions>) => {
      p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

      const config = await resolveConfig(options)

      const user = await fetchUser(config)
      const pullRequests = await fetchPullRequests(user, config)

      const stats = await fetchStats(user, pullRequests, config)

      const rank = calculateRank({
        commits: stats.commits,
        prs: stats.pullRequest.totalCount,
        issues: stats.issues.totalCount,
        reviews: stats.reviews,
        repos: stats.repositories.totalCount,
        stars: stats.repositories.totalStargazers,
        followers: stats.followers,
      })

      await generate({ ...stats, rank }, config)
    })

  cli.help()
  cli.version(VERSION)
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}

async function fetchUser(options: Options): Promise<GitHubUser> {
  const spinner = p.spinner()
  spinner.start('getting user information')
  const user = await getUser(options)
  spinner.stop('user information retrieved')
  return user
}

async function fetchPullRequests(user: GitHubUser, options: Options): Promise<PullRequest[]> {
  const spinner = p.spinner()
  spinner.start('getting pull requests')
  const data = await getPullRequests(user.username, options)
  spinner.stop(`pull requests retrieved: ${data.length}`)
  return data
}

async function fetchStats(user: GitHubUser, pullRequests: PullRequest[], options: Options): Promise<Omit<GitHubStats, 'rank'>> {
  const spinner = p.spinner()
  spinner.start('getting stats')
  const response = await getGraphQLStats(user, options)
  const stats: Omit<GitHubStats, 'rank'> = {
    user,
    commits: response.commits.totalCommitContributions ?? 0,
    reviews: response.reviews.totalPullRequestReviewContributions ?? 0,
    repositoriesContributedTo: response.repositoriesContributedTo.totalCount,
    pullRequest: {
      totalCount: response.pullRequests.totalCount,
      mergedCount: response.mergedPullRequests.totalCount,
      data: pullRequests,
    },
    issues: {
      totalCount: response.openIssues.totalCount + response.closedIssues.totalCount,
      openCount: response.openIssues.totalCount,
      closedCount: response.closedIssues.totalCount,
    },
    followers: response.followers.totalCount,
    discussions: {
      totalCount: response.repositoryDiscussions.totalCount,
      commentsCount: response.repositoryDiscussionComments.totalCount,
    },
    repositories: {
      totalCount: response.repositories.totalCount,
      totalStargazers: response.repositories.nodes.reduce((acc, repo) => acc + repo.stargazers.totalCount, 0),
      data: response.repositories.nodes.map(node => ({ name: node.name, stargazers: node.stargazers.totalCount })),
    },
  }
  spinner.stop('stats retrieved')
  return stats
}
