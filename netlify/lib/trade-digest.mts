// Both statuses put a player on the block. Moving between them is not a new addition.
export function addedPlayers(record: any, previous: any): number[] {
  const players = (row: any): number[] => [...(Array.isArray(row?.listing?.available) ? row.listing.available : []), ...(Array.isArray(row?.listing?.openTo) ? row.listing.openTo : [])].map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  const old = new Set(players(previous));
  return [...new Set(players(record))].filter(id => !old.has(id));
}

export function easternClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return { day: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}
