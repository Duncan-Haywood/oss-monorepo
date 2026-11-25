import { execFileSync } from 'node:child_process';
export function f(user, el) {
  execFileSync('git', ['log', user]);
  el.textContent = user;
  el.innerHTML = '';
}
