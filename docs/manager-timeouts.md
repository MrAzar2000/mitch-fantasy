# Manager timeouts

Open More → Admin controls, unlock admin mode, then choose Manager timeouts. Select a manager, enter a custom duration in seconds, minutes, hours, or days, and verify the admin password to save. A new timeout replaces the previous expiry. End timeout removes it early. Durations range from one second to 365 days.

Timeouts are saved in Netlify Database. Browsers check the selected team every 15 seconds and when returning to the page or reconnecting. An active timeout shows a modal countdown that closes automatically at expiry. The countdown uses the server's time to account for differences in device clocks. Admin mode is exempt so the admin can manage or end timeouts.

The site currently identifies visitors by their selected team, rather than authenticated manager accounts. The popup follows that selection across devices; it is a league UI feature, not server-enforced account suspension. Offline browsers cannot discover a new timeout until they reconnect, but an already loaded countdown continues running.

The new migration is applied automatically during deployment. Existing applied migrations were left unchanged.
