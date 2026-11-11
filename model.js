// Pure data and date helpers for the static recruiting dashboard.

export const FULL_METRICS = [
  'jobPosts', 'bossAccounts', 'viewedCandidates', 'profileViews',
  'greetingsSent', 'greetingsReceived', 'conversations', 'wecomAdds',
  'resumes', 'invitations', 'attended', 'noShows', 'pending', 'passed',
  'verifiedHires', 'traffic'
];

export const CORE_METRICS = [
  'conversations', 'wecomAdds', 'resumes', 'invitations',
  'attended', 'passed', 'verifiedHires'
];

export const SNAPSHOT_METRICS = new Set(['jobPosts', 'bossAccounts']);
export const PLATFORM_METRICS = new Set([
  'viewedCandidates', 'profileViews', 'greetingsSent', 'greetingsReceived',
  'conversations', 'traffic'
]);
export const COHORT_METRICS = new Set([
  'invitations', 'attended', 'noShows', 'pending', 'passed'
]);

export function isoValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(value, amount) {
  if (!isoValid(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

export function inRange(value, start, end) {
  return typeof value === 'string' && value >= start && value <= end;
}

export function presetRange(data, preset) {
  const periodStart = data.meta.periodStart;
  const end = data.meta.periodEnd;
  if (preset === 'all') return { start: periodStart, end };
  if (preset === 'month') {
    const first = `${end.slice(0, 7)}-01`;
    return { start: first < periodStart ? periodStart : first, end };
  }
  if (preset === 'week') {
    const first = shiftDate(end, -6);
    return { start: first < periodStart ? periodStart : first, end };
  }
  return { start: end, end };
}

export function unique(values) {
  return [...new Set(values)];
}

export function total(values) {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function numericSort(left, right, key) {
  const a = left?.values ? left.values[key] : left?.[key];
  const b = right?.values ? right.values[key] : right?.[key];
  const av = Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY;
  const bv = Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY;
  return bv - av;
}

function datesBetween(start, end) {
  if (!isoValid(start) || !isoValid(end) || start > end) return [];
  const dates = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

function selectedRows(rows, start, end, recruiterId) {
  return (rows || []).filter(row => inRange(row.date, start, end) && (!recruiterId || row.recruiterId === recruiterId));
}

function sumField(rows, field) {
  const values = rows.map(row => row[field]).filter(Number.isFinite);
  return values.length ? total(values) : 0;
}

export function aggregateInvites(data, start, end, options = {}) {
  const recruiterId = typeof options === 'string' ? options : options?.recruiterId;
  const rows = selectedRows(data.inviteDaily, start, end, recruiterId);
  const result = {
    invitations: sumField(rows, 'invitations'),
    attended: sumField(rows, 'attended'),
    noShows: sumField(rows, 'noShows'),
    statusUnknown: sumField(rows, 'statusUnknown'),
    passed: sumField(rows, 'passed'),
    failed: sumField(rows, 'failed'),
    resultUnknown: sumField(rows, 'resultUnknown'),
    scheduledOverdueUnknown: sumField(rows, 'scheduledOverdueUnknown'),
    scheduleMissingUnknown: sumField(rows, 'scheduleMissingUnknown')
  };
  result.feedbackCount = result.passed + result.failed;
  result.passRate = result.feedbackCount ? result.passed / result.feedbackCount : null;
  return result;
}

export function aggregateHires(data, start, end, options = {}) {
  const recruiterId = typeof options === 'string' ? options : options?.recruiterId;
  const rows = selectedRows(data.hireDaily, start, end, recruiterId);
  return {
    reported: sumField(rows, 'reported'),
    verified: sumField(rows, 'verified'),
    trialExcluded: sumField(rows, 'trialExcluded')
  };
}

export function sourceCoverage(data, start, end, recruiterId = null) {
  return (data.bossCoverage || [])
    .filter(row => inRange(row.date, start, end))
    .map(row => {
      const recruiters = row.recruiterIds || [];
      const covered = recruiterId
        ? recruiters.includes(recruiterId)
        : row.reportedCount >= row.expectedCount;
      return { ...row, covered };
    });
}

function sumDailyMetric(rows, key) {
  const cells = rows.map(row => row.metrics?.[key]).filter(Number.isFinite);
  return cells.length ? total(cells) : null;
}

function metricValue(data, rows, start, end, recruiterId, key, lastDate) {
  if (SNAPSHOT_METRICS.has(key)) {
    const latest = rows.filter(row => row.date === lastDate);
    return sumDailyMetric(latest, key);
  }
  if (key === 'resumes') {
    const resumeStart = data.meta.resumeStart;
    if (!datesBetween(start, end).some(date => date >= resumeStart)) return null;
    return sumField(selectedRows(data.resumeDaily, start, end, recruiterId), 'count');
  }
  if (COHORT_METRICS.has(key)) {
    const invites = aggregateInvites(data, start, end, { recruiterId });
    return key === 'pending' ? invites.statusUnknown : invites[key];
  }
  if (key === 'verifiedHires') {
    return aggregateHires(data, start, end, { recruiterId }).verified;
  }
  return sumDailyMetric(rows, key);
}

export function aggregateDaily(data, start, end, recruiterId = null) {
  const from = start || data.meta.periodStart;
  const to = end || data.meta.periodEnd;
  const requestedDates = datesBetween(from, to);
  const rows = selectedRows(data.daily, from, to, recruiterId);
  const dates = unique(rows.map(row => row.date)).sort();
  const lastDate = dates.at(-1) || null;
  const hasData = rows.length > 0;
  const values = {};
  const coverage = {};

  for (const key of FULL_METRICS) {
    values[key] = hasData ? metricValue(data, rows, from, to, recruiterId, key, lastDate) : null;
    let relevantRows = rows;
    if (key === 'resumes') relevantRows = rows.filter(row => row.date >= data.meta.resumeStart);
    const cells = relevantRows.map(row => row.metrics?.[key]);
    const knownDates = unique(relevantRows.filter((row, index) => Number.isFinite(cells[index])).map(row => row.date)).sort();
    const coveredDays = key === 'resumes'
      ? unique(relevantRows.map(row => row.date)).length
      : knownDates.length;
    const missingCells = key === 'resumes'
      ? 0
      : cells.filter(value => value === null || value === undefined || !Number.isFinite(value)).length;
    coverage[key] = {
      days: coveredDays,
      missingCells,
      start: knownDates[0] || (key === 'resumes' ? unique(relevantRows.map(row => row.date)).sort()[0] : null) || null,
      end: knownDates.at(-1) || (key === 'resumes' ? unique(relevantRows.map(row => row.date)).sort().at(-1) : null) || null
    };
  }

  return {
    values,
    dates,
    lastDate,
    hasData,
    requestedDays: requestedDates.length,
    coverage
  };
}

export function trendPoints(data, start, end, key, recruiterId = null) {
  return datesBetween(start, end).map(date => {
    const aggregate = aggregateDaily(data, date, date, recruiterId);
    const coverage = sourceCoverage(data, date, date, recruiterId);
    return {
      date,
      value: aggregate.hasData ? aggregate.values[key] : null,
      partial: PLATFORM_METRICS.has(key) && coverage.some(row => !row.covered)
    };
  });
}

export function projectsForPeriod(data, start, end, recruiterId = null) {
  const projects = new Map();
  const getProject = client => {
    if (!client) return null;
    if (!projects.has(client)) {
      projects.set(client, {
        client,
        conversations: 0,
        resumes: 0,
        invitations: 0,
        attended: 0,
        noShows: 0,
        statusUnknown: 0,
        passed: 0,
        failed: 0,
        resultUnknown: 0,
        reported: 0,
        verifiedHires: 0,
        trialExcluded: 0,
        jobs: [],
        recruiterIds: [],
        sourcePresence: { boss: false, resumes: false, invites: false, hires: false }
      });
    }
    return projects.get(client);
  };
  const includePerson = (project, id) => {
    if (id && !project.recruiterIds.includes(id)) project.recruiterIds.push(id);
  };

  for (const row of selectedRows(data.bossDaily, start, end, recruiterId)) {
    const project = getProject(row.client);
    if (!project) continue;
    project.sourcePresence.boss = true;
    project.conversations += Number(row.conversations) || 0;
    if (row.job && !project.jobs.includes(row.job)) project.jobs.push(row.job);
    includePerson(project, row.recruiterId);
  }
  for (const row of selectedRows(data.resumeDaily, start, end, recruiterId)) {
    const project = getProject(row.client);
    if (!project) continue;
    project.sourcePresence.resumes = true;
    project.resumes += Number(row.count) || 0;
    if (row.job && !project.jobs.includes(row.job)) project.jobs.push(row.job);
    includePerson(project, row.recruiterId);
  }
  for (const row of selectedRows(data.inviteDaily, start, end, recruiterId)) {
    const project = getProject(row.client);
    if (!project) continue;
    project.sourcePresence.invites = true;
    for (const key of ['invitations', 'attended', 'noShows', 'statusUnknown', 'passed', 'failed', 'resultUnknown']) {
      project[key] += Number(row[key]) || 0;
    }
    if (row.job && !project.jobs.includes(row.job)) project.jobs.push(row.job);
    includePerson(project, row.recruiterId);
  }
  for (const row of selectedRows(data.hireDaily, start, end, recruiterId)) {
    const project = getProject(row.client);
    if (!project) continue;
    project.sourcePresence.hires = true;
    project.reported += Number(row.reported) || 0;
    project.verifiedHires += Number(row.verified) || 0;
    project.trialExcluded += Number(row.trialExcluded) || 0;
    if (row.job && !project.jobs.includes(row.job)) project.jobs.push(row.job);
    includePerson(project, row.recruiterId);
  }

  return [...projects.values()].map(project => {
    project.recruiterIds = unique(project.recruiterIds);
    project.jobs = unique(project.jobs);
    if (!project.sourcePresence.boss) project.conversations = null;
    if (!project.sourcePresence.resumes) project.resumes = null;
    if (!project.sourcePresence.invites) {
      for (const key of ['invitations', 'attended', 'noShows', 'statusUnknown', 'passed', 'failed', 'resultUnknown']) project[key] = null;
    }
    if (!project.sourcePresence.hires) {
      for (const key of ['reported', 'verifiedHires', 'trialExcluded']) project[key] = null;
    }
    return project;
  });
}
