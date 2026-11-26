#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [semgrepPath, trivyPath, outputPath] = process.argv.slice(2);
if (!semgrepPath || !trivyPath || !outputPath) {
  console.error('Uso: node scripts/build-security-report.js semgrep.json trivy.json relatorio.html');
  process.exit(2);
}

function readReport(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function severity(value) {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  const allowed = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'WARNING', 'ERROR'];
  return allowed.includes(normalized) ? normalized : 'UNKNOWN';
}

function link(url, label) {
  if (!url || !/^https:\/\//i.test(url)) return esc(label);
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

const semgrep = readReport(semgrepPath);
const trivy = readReport(trivyPath);

const codeFindings = (semgrep?.results || []).map((finding) => ({
  severity: severity(finding.extra?.severity),
  id: finding.check_id || 'Regra Semgrep',
  location: `${finding.path || '?'}:${finding.start?.line || '?'}`,
  message: finding.extra?.message || '',
  cwe: (finding.extra?.metadata?.cwe || []).join(', ')
}));

const dependencyFindings = (trivy?.Results || []).flatMap((result) =>
  (result.Vulnerabilities || []).map((finding) => ({
    severity: severity(finding.Severity),
    id: finding.VulnerabilityID || 'Vulnerabilidade',
    package: finding.PkgName || '',
    version: finding.InstalledVersion || '',
    fixed: finding.FixedVersion || '',
    title: finding.Title || finding.Description || '',
    target: result.Target || '',
    url: finding.PrimaryURL || ''
  }))
);

const total = codeFindings.length + dependencyFindings.length;
const statusLabel = (report, fallback) => report
  ? `${report.results?.length ?? report.Results?.reduce((n, item) => n + (item.Vulnerabilities?.length || 0), 0) ?? 0} achado(s)`
  : `Relatório indisponível (${fallback})`;

const codeRows = codeFindings.length
  ? codeFindings.map((finding) => `<tr>
      <td><span class="badge ${esc(finding.severity)}">${esc(finding.severity)}</span></td>
      <td><code>${esc(finding.id)}</code></td>
      <td><code>${esc(finding.location)}</code></td>
      <td>${esc(finding.message)}${finding.cwe ? `<br><small>${esc(finding.cwe)}</small>` : ''}</td>
    </tr>`).join('')
  : `<tr><td colspan="4" class="empty">${semgrep ? 'Nenhum achado de SAST neste relatório.' : 'O arquivo semgrep.json não foi gerado.'}</td></tr>`;

const dependencyRows = dependencyFindings.length
  ? dependencyFindings.map((finding) => `<tr>
      <td><span class="badge ${esc(finding.severity)}">${esc(finding.severity)}</span></td>
      <td>${link(finding.url, finding.id)}</td>
      <td><code>${esc(finding.package)}</code><br><small>${esc(finding.version)} → ${esc(finding.fixed || 'sem versão corrigida informada')}</small></td>
      <td><code>${esc(finding.target)}</code><br>${esc(finding.title)}</td>
    </tr>`).join('')
  : `<tr><td colspan="4" class="empty">${trivy ? 'Nenhuma vulnerabilidade de dependência neste relatório.' : 'O arquivo trivy.json não foi gerado.'}</td></tr>`;

const repo = process.env.GITHUB_REPOSITORY || 'execução local';
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 12);
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relatório de segurança — Todo Security Lab</title>
  <style>
    :root{color-scheme:light;--ink:#17221f;--muted:#65736e;--line:#dce5df;--paper:#f5f8f4;--green:#176b50;--red:#a62828}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
    main{max-width:1120px;margin:0 auto;padding:40px 24px 64px}header{padding:28px;background:#fff;border:1px solid var(--line);border-radius:18px}
    h1{margin:0 0 8px;font-size:clamp(1.8rem,4vw,2.6rem)}h2{margin:32px 0 12px;font-size:1.35rem}
    p,.meta{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:22px}
    .card{background:white;border:1px solid var(--line);border-radius:14px;padding:18px}.card strong{display:block;font-size:1.8rem}
    .card span{color:var(--muted)}.total strong{color:${total ? 'var(--red)' : 'var(--green)'}}
    .table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
    table{width:100%;border-collapse:collapse;min-width:760px}th,td{text-align:left;padding:13px 15px;border-bottom:1px solid var(--line);vertical-align:top}
    th{background:#f0f5f1;font-size:.84rem;text-transform:uppercase;letter-spacing:.04em}tr:last-child td{border-bottom:0}
    code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}small{color:var(--muted)}
    a{color:#145e91}.badge{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.75rem;font-weight:750;background:#edf0f1}
    .CRITICAL,.HIGH,.ERROR{background:#fde8e6;color:#8b1717}.MEDIUM,.WARNING{background:#fff1d6;color:#794d00}.LOW,.INFO{background:#e6f3ea;color:#185b36}
    .empty{text-align:center;color:var(--muted);padding:22px}footer{margin-top:34px;color:var(--muted);font-size:.9rem}
    @media(max-width:600px){main{padding:18px 12px 40px}header{padding:20px}}
  </style>
</head>
<body><main>
  <header>
    <h1>Relatório de segurança</h1>
    <p>Resumo dos resultados do Semgrep (SAST) e do Trivy (SCA). Este relatório descreve os achados dos scanners; um achado não significa automaticamente que a aplicação inteira esteja vulnerável.</p>
    <div class="meta">Repositório: <strong>${esc(repo)}</strong> · Revisão: <code>${esc(sha)}</code>${runUrl ? ` · <a href="${esc(runUrl)}">Abrir execução no GitHub Actions</a>` : ''}</div>
    <section class="cards" aria-label="Resumo dos resultados">
      <div class="card total"><strong>${total}</strong><span>achados totais</span></div>
      <div class="card"><strong>${codeFindings.length}</strong><span>SAST · ${esc(statusLabel(semgrep, 'scanner indisponível'))}</span></div>
      <div class="card"><strong>${dependencyFindings.length}</strong><span>SCA · ${esc(statusLabel(trivy, 'scanner indisponível'))}</span></div>
    </section>
  </header>
  <h2>🔎 Código da aplicação — Semgrep (SAST)</h2>
  <div class="table-wrap"><table><thead><tr><th>Gravidade</th><th>Regra</th><th>Local</th><th>Descrição</th></tr></thead><tbody>${codeRows}</tbody></table></div>
  <h2>📦 Dependências — Trivy (SCA)</h2>
  <div class="table-wrap"><table><thead><tr><th>Gravidade</th><th>Identificador</th><th>Pacote e versão</th><th>Alvo e descrição</th></tr></thead><tbody>${dependencyRows}</tbody></table></div>
  <footer>Gerado automaticamente a partir dos relatórios JSON dos scanners. Para detalhes completos, consulte os artefatos semgrep-report e trivy-report da execução.</footer>
</main></body></html>`;

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Relatório HTML gerado: ${outputPath} (${codeFindings.length} achado(s) SAST, ${dependencyFindings.length} achado(s) SCA).`);
