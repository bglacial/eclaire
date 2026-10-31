const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let keyboard = false;
document.addEventListener('keydown', () => { keyboard = true; document.documentElement.classList.add('keyboard'); });
document.addEventListener('pointerdown', () => { keyboard = false; document.documentElement.classList.remove('keyboard'); });
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    observer.unobserve(entry.target);
    const index = [...entry.target.parentElement.children].indexOf(entry.target) % 3;
    entry.target.style.animationDelay = `${index * 70}ms`;
    entry.target.classList.add('entered');
  }
}, { threshold: .08 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
const frame = document.getElementById('prototype');
const input = document.getElementById('demo-destination');
async function calculate() {
  const app = frame.contentWindow?.eclaireDemo;
  if (!app) { document.getElementById('demo-note').textContent = 'Le réseau Paris charge encore. Réessayez dans un instant.'; return; }
  app.show('prepare', false);
  const field = frame.contentDocument.getElementById('destination'); field.value = input.value;
  field.closest('form').requestSubmit();
  document.getElementById('demo-note').textContent = frame.contentDocument.getElementById('status').textContent;
}
document.getElementById('demo-form').onsubmit = event => { event.preventDefault(); calculate(); };
document.querySelectorAll('[data-destination]').forEach(button => { button.onclick = () => { input.value = button.dataset.destination; calculate(); }; });
const screens = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) document.getElementById('stage-image').src = `assets/${entry.target.dataset.screen}.png`; }, { rootMargin: '-15% 0px -50% 0px' });
document.querySelectorAll('.moment').forEach(element => screens.observe(element));
const choices = [
  ['Carte', 'La carte d’abord.', 'Un fond calme et un trajet orange. La menthe est réservée à l’action principale ; les deux couleurs du calcul gardent leur rôle d’explication.', 'La palette de nuit est manuelle dans cette proposition.'],
  ['Étapes', 'Le trajet peut changer.', 'Un seul espace pour ajouter, retirer et réordonner les étapes. L’annulation garde la route actuelle et l’application des changements déclenche un nouveau calcul.', 'Le prototype recalcule depuis le Louvre. L’alpha native utilise une position fraîche.'],
  ['Détours', 'La pause a un prix lisible.', 'Le temps ajouté et la distance apparaissent avant la sélection. Le lieu devient une étape, sans imposer une nouvelle recherche de destination.', 'Les exemples de restaurants proviennent de l’extrait Paris. Leurs horaires ne sont pas vérifiés.'],
  ['Guidage', 'La prochaine action domine.', 'Une instruction, une distance et le temps restant. Le retour au suivi apparaît après un mouvement de carte. La position se déplace uniquement quand vous avancez la simulation.', 'Le prototype ne donne aucune instruction de conduite réelle.'],
  ['Signal GPS', 'Dire ce que l’on sait.', 'Dans la future interface, un état discret distinguerait la position reçue de la position estimée. Une perte prolongée demanderait de rester attentif, sans interrompre chaque microcoupure.', 'La simulation n’accède pas au GPS. La formulation des états reste à valider sur téléphone.'],
  ['Mouvements', 'Le mouvement explique.', 'Une pression courte confirme le toucher. Les panneaux changent dans le même espace. Le calcul dévoile ses traces réelles ; les nombres et les instructions restent immobiles.', 'Mouvement réduit : résultat direct et transitions d’opacité. Activation au clavier : changement immédiat.'],
];
const list = document.getElementById('commands');
let selected = 0;
function select(index) {
  selected = index;
  document.getElementById('choice-title').textContent = choices[index][1];
  document.getElementById('choice-copy').textContent = choices[index][2];
  document.getElementById('choice-limit').textContent = choices[index][3];
  list.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.index) === selected)));
}
function filter() {
  const query = document.getElementById('filter').value.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  list.replaceChildren();
  choices.forEach((choice, i) => {
    if (!choice.join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(query)) return;
    const button = document.createElement('button'); button.dataset.index = i; button.textContent = `${choice[0]} ↗`; button.setAttribute('aria-pressed', String(i === selected)); button.onclick = () => select(i); list.append(button);
  });
  document.getElementById('empty').hidden = list.childElementCount > 0;
}
document.getElementById('filter').oninput = filter;
list.onkeydown = event => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...list.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault(); buttons[next]?.focus(); if (buttons[next]) select(Number(buttons[next].dataset.index));
};
filter();
