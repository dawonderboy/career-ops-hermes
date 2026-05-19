function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname.includes('job-boards.greenhouse.io')) {
      return parts[0] || '';
    }
    if (u.hostname.includes('boards-api.greenhouse.io')) {
      const m = u.pathname.match(/\/boards\/([^/]+)\/jobs/i);
      return m?.[1] || parts[1] || '';
    }
    return parts[0] || '';
  } catch {
    return '';
  }
}

function publicJobUrl(entry, job, apiUrl) {
  if (job.absolute_url) return job.absolute_url;
  if (job.absoluteUrl) return job.absoluteUrl;
  if (job.job_url) return job.job_url;
  if (job.url) return job.url;
  const slug = slugFromUrl(entry.careers_url || apiUrl);
  if (!slug) return entry.careers_url || apiUrl || '';
  return `https://job-boards.greenhouse.io/${slug}/jobs/${job.id}`;
}

export default {
  id: 'greenhouse',

  detect(entry) {
    const url = `${entry.api || ''} ${entry.careers_url || ''}`.toLowerCase();
    return url.includes('greenhouse.io') ? { url: entry.api || entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = entry.api || (() => {
      const slug = slugFromUrl(entry.careers_url || '');
      if (!slug) return '';
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    })();

    if (!apiUrl) {
      throw new Error('greenhouse: missing api/careers_url');
    }

    const json = await ctx.fetchJson(apiUrl);
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(job => ({
      title: job.title || '',
      company: entry.name || '',
      location: job.location?.name || job.location || '',
      url: publicJobUrl(entry, job, apiUrl),
      source: 'greenhouse',
      posted_date: job.updated_at || job.updatedAt || job.created_at || job.createdAt || '',
    }));
  },
};
