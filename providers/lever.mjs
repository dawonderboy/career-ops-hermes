function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  } catch {
    return '';
  }
}

function getJobs(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.jobs)) return json.jobs;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

export default {
  id: 'lever',

  detect(entry) {
    const url = `${entry.api || ''} ${entry.careers_url || ''}`.toLowerCase();
    return url.includes('lever.co') ? { url: entry.api || entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = entry.api || (() => {
      const slug = slugFromUrl(entry.careers_url || '');
      if (!slug) return '';
      return `https://api.lever.co/v0/postings/${slug}?mode=json`;
    })();

    if (!apiUrl) {
      throw new Error('lever: missing api/careers_url');
    }

    const json = await ctx.fetchJson(apiUrl);
    return getJobs(json).map(job => ({
      title: job.text || job.title || '',
      company: entry.name || '',
      location: job.categories?.location || job.categories?.team || job.categories?.commitment || '',
      url: job.hostedUrl || job.applyUrl || job.url || job.leverUrl || '',
      source: 'lever',
      posted_date: job.createdAt || job.created_at || job.postedAt || '',
    }));
  },
};
