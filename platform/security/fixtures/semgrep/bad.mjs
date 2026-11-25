import { execSync } from 'node:child_process';
export function f(user, el) {
  execSync(`git log ${user}`);
  eval(user);
  const agent = { rejectUnauthorized: false };
  el.innerHTML = user;
  return agent;
}
