const commercialForm = document.querySelector('#commercial-contact-form');
const commercialMessage = document.querySelector('#commercial-contact-message');

commercialForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = commercialForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Enviando…';
  commercialMessage.textContent = '';
  try {
    const response = await fetch('/api/commercial/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(commercialForm))) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o contato.');
    commercialForm.reset();
    commercialMessage.textContent = payload.message;
    commercialMessage.className = 'success';
  } catch (error) {
    commercialMessage.textContent = error.message;
    commercialMessage.className = 'error';
  } finally {
    button.disabled = false;
    button.textContent = 'Solicitar contato';
  }
});

fetch('/api/public/platform-info').then(response => response.json()).then(info => {
  if (!info.supportWhatsapp) return;
  const link = document.createElement('a');
  link.className = 'whatsapp-float'; link.target = '_blank'; link.rel = 'noopener';
  link.href = `https://wa.me/${info.supportWhatsapp}?text=${encodeURIComponent('Olá! Quero conhecer melhor o TISSFlow para minha clínica.')}`;
  link.textContent = 'WhatsApp'; link.setAttribute('aria-label', 'Conversar com o TISSFlow pelo WhatsApp'); document.body.append(link);
}).catch(() => {});
