function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function getJobs(json) {
  if (Array.isArray(json?.jobPostings)) return json.jobPostings;
  if (Array.isArray(json?.jobs)) return json.jobs;
  return [];
}

export default {
  id: 'workday',

  detect(entry) {
    const url = `${entry.api || ''} ${entry.careers_url || ''}`.toLowerCase();
    return url.includes('myworkdayjobs.com') ? { url: entry.api || entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = entry.api;
    if (!apiUrl) {
      throw new Error('workday: explicit api required');
    }

    const origin = originFromUrl(entry.careers_url || apiUrl);
    const jobs = [];
    const limit = 200;
    let offset = 0;

    while (true) {
      const json = await ctx.fetchJson(apiUrl, {}, {
        method: 'POST',
        body: { appliedFacets: {}, limit, offset, searchText: '' },
      });
      const batch = getJobs(json);
      if (!batch.length) break;
      jobs.push(...batch);
      const total = Number(json?.total || 0);
      offset += batch.length;
      if (offset >= total || batch.length < limit) break;
    }

    return jobs.map(job => ({
      title: job.title || '',
      company: entry.name || '',
      location: job.locationsText || job.locationText || '',
      url: job.externalPath ? `${origin}${job.externalPath}` : (entry.careers_url || apiUrl),
      source: 'workday',
      posted_date: job.postedOn || job.postedDate || '',
    }));
  },
};
