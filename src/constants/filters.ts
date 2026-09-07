/** Installed-agent count at or above which the agent filter switches from
 *  always-visible chips to a checkbox-list dropdown. Below this, chips are
 *  zero-click and scannable at a glance; at and past it they'd wrap onto a
 *  second row, and a dropdown scales better. Shared by AllSkillsView and
 *  AllMcpsView so the two pages switch at the same point. */
export const AGENT_SELECTOR_DROPDOWN_THRESHOLD = 3
