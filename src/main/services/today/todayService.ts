import { focusStore } from '../store';
import { sortDeadlines } from '../deadlines/deadlineService';
import { isActiveCriticalAlert } from '../gmail/criticalEmailService';

function dayRange(offset: number): [number, number] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start.getTime(), end.getTime()];
}

export const todayService = {
  get() {
    const [todayStart, todayEnd] = dayRange(0);
    const [, tomorrowEnd] = dayRange(1);
    const weekEnd = todayStart + 7 * 24 * 60 * 60_000;
    const deadlines = sortDeadlines(focusStore.get('academicDeadlines').filter(d => !d.completed));
    const assignments = focusStore.get('assignments').filter(a => !['submitted', 'archived'].includes(a.status));
    const alerts = focusStore.get('criticalEmailAlerts').filter(a => isActiveCriticalAlert(a));
    const confusions = focusStore.get('confusionItems').filter(c => c.status !== 'resolved');
    const sessions = focusStore.get('classSessions').filter(s => s.startedAt >= todayStart && s.startedAt <= todayEnd);

    const dueToday = deadlines.filter(d => d.deadlineAt <= todayEnd);
    const dueTomorrow = deadlines.filter(d => d.deadlineAt > todayEnd && d.deadlineAt <= tomorrowEnd);
    const dueThisWeek = deadlines.filter(d => d.deadlineAt > tomorrowEnd && d.deadlineAt <= weekEnd);

    return {
      currentFocusTask: focusStore.get('todos').find(t => t.isActive && !t.completed),
      nextDeadline: deadlines[0],
      dueToday,
      dueTomorrow,
      dueThisWeek,
      criticalAlerts: alerts,
      activeAssignment: assignments[0],
      unresolvedConfusions: confusions,
      classSessionsToday: sessions,
      recommendedNextAction: dueToday[0]?.title
        ? `Work on ${dueToday[0].title}`
        : alerts[0]?.subject
          ? `Handle alert: ${alerts[0].subject}`
          : 'Add a course, syllabus, assignment, or deadline to build today plan',
    };
  },
};
