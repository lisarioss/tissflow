fetch('/api/public/platform-info').then(response => response.json()).then(info => {
  const safe = value => { const element = document.createElement('span'); element.textContent = value || ''; return element.innerHTML; };
  const complete = info.legalName && info.supportEmail && info.privacyEmail;
  const pageVersion = location.pathname.includes('privacidade') ? info.legalVersions?.privacy : info.legalVersions?.terms;
  if (pageVersion) { const [year, month, day] = pageVersion.split('-'); const eyebrow = document.querySelector('.eyebrow'); if (eyebrow) eyebrow.textContent = `Versão de ${day}/${month}/${year}`; }
  document.querySelector('.notice')?.toggleAttribute('hidden', complete);
  const section = document.createElement('section');
  section.innerHTML = `<h2>Identificação e canais oficiais</h2><p><strong>${safe(info.legalName || info.tradeName || 'TISSFlow')}</strong>${info.cnpj ? ` · CNPJ ${safe(info.cnpj)}` : ''}${info.address ? `<br>${safe(info.address)}` : ''}<br>Suporte: ${info.supportEmail ? `<a href="mailto:${encodeURIComponent(info.supportEmail)}">${safe(info.supportEmail)}</a>` : 'a definir'}<br>Privacidade: ${info.privacyEmail ? `<a href="mailto:${encodeURIComponent(info.privacyEmail)}">${safe(info.privacyEmail)}</a>` : 'a definir'}</p>`;
  document.querySelector('.legal-page')?.append(section);
}).catch(() => {});
