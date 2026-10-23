export function allowsNotification(
  p: {
    alert_categories?: unknown;
    quiet_start?: number | null;
    quiet_end?: number | null;
    utc_offset?: number;
  },
  category: string,
  now = Date.now(),
) {
  if (
    Array.isArray(p.alert_categories) &&
    !p.alert_categories.includes(category)
  )
    return false;
  const start = p.quiet_start,
    end = p.quiet_end;
  if (start == null || end == null) return true;
  const hour = new Date(now - (p.utc_offset || 0) * 60000).getUTCHours();
  return !(start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end);
}
