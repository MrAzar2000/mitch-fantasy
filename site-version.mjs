// This footer loads independently of the league feed, including on load failures.
const footer = document.getElementById('siteRelease');
// Shown last in the footer, whether or not the release details load.
function refreshNote() {
  const note = document.createElement('p');
  note.className = 'site-refresh-note';
  note.textContent = 'League data updates every minute while a game is live and once an hour the rest of the time.';
  return note;
}
if (footer) {
  try {
    const response = await fetch('/site-version.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Release unavailable');
    const release = await response.json();
    if (typeof release.version !== 'string') throw new Error('Invalid release');
    const version = document.createElement('span');
    version.textContent = `Website v${release.version.split("+")[0]}`;
    const date = new Date(release.updatedAt || NaN);
    const updated = document.createElement('span');
    if (Number.isFinite(date.getTime())) {
      updated.append('Website updated ');
      const time = document.createElement('time');
      time.dateTime = date.toISOString();
      time.textContent = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'short',
      }).format(date);
      time.title = date.toUTCString();
      updated.append(time);
    } else updated.textContent = 'Update date available after deployment';
    footer.replaceChildren(version, updated);
    if (Array.isArray(release.changes) && release.changes.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'What’s new';
      const releases = [release, ...(Array.isArray(release.history) ? release.history.slice(0, 2) : [])];
      for (const entry of releases) {
        const section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = `v${String(entry.version).split('+')[0]}${entry.title ? ' · ' + entry.title : ' · Latest update'}`;
        const list = document.createElement('ul');
        for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
          const item = document.createElement('li');
          item.textContent = String(change);
          list.append(item);
        }
        section.append(heading, list);
        details.append(section);
      }
      details.prepend(summary);
      footer.append(details);
    }
    footer.append(refreshNote());
  } catch {
    footer.textContent = 'Website version temporarily unavailable';
    footer.append(refreshNote());
  }
}
