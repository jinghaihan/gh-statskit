import type { GitHubStats, Options } from './types'
import { writeFile } from 'node:fs/promises'
import * as p from '@clack/prompts'
import c from 'ansis'
import { join } from 'pathe'
import { updateGist } from './git'

export async function generate(data: GitHubStats, options: Options) {
  const filepath = join(options.cwd, options.gistFilename)
  await writeFile(filepath, JSON.stringify(data, null, 2))

  if (!options.gistId) {
    p.outro(`${c.green('✓')} ${c.dim('Local file:')} ${filepath}`)
    return
  }

  const spinner = p.spinner()
  try {
    spinner.start('updating gist')
    const gistUrl = await updateGist(data, options)
    spinner.stop('gist updated successfully')
    p.outro(`${c.green('✓')} ${c.dim('Gist URL:')} ${gistUrl}`)
  }
  catch (error) {
    spinner.stop('failed to update gist')
    p.outro(`${c.red('✗')} ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
