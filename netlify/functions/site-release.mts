import type { DeploySucceededEvent } from '@netlify/functions';
import { recordActivity } from '../lib/site-activity.mjs';
export default {
  async deploySucceeded(event: DeploySucceededEvent) {
    const deploy = event.deploy;
    const description = [deploy.title, deploy.commitMessage].filter(Boolean).join('\n').slice(0,3000);
    await recordActivity('change', 'website_deployed', `Website deployment ${deploy.id} (${deploy.context}).\n${description}`, `deploy-${deploy.id}`);
  },
};
