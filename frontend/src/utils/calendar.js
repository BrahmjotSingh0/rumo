// Calendar links for scheduled meetings. Entirely client-side - Google and
// Outlook both support creating an event via a plain URL, and an .ics file
// is just a text format, so none of this needs a backend endpoint.

export function buildMeetingUrl(roomId) {
  return `${window.location.origin}/room/${roomId}`;
}

function formatDateUTC(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildGoogleCalendarUrl({ title, description, url, start, durationMinutes = 60 }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description ? `${description}\n\n${url}` : url,
    location: url,
    dates: `${formatDateUTC(startDate)}/${formatDateUTC(endDate)}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl({ title, description, url, start, durationMinutes = 60 }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    body: description ? `${description}\n\n${url}` : url,
    location: url,
    startdt: startDate.toISOString(),
    enddt: endDate.toISOString()
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function downloadIcsFile({ title, description, url, start, durationMinutes = 60 }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const escapeIcs = (value) => String(value).replace(/([,;])/g, '\\$1');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rumo//Meeting//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@rumo`,
    `DTSTAMP:${formatDateUTC(new Date())}`,
    `DTSTART:${formatDateUTC(startDate)}`,
    `DTEND:${formatDateUTC(endDate)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description ? `${description}\n\n${url}` : url)}`,
    `LOCATION:${escapeIcs(url)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'meeting'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
