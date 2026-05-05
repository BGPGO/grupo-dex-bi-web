#!/usr/bin/env node
/* Gera report.json (consolidado) + report-conta-{slug}.json (24 lojas)
 * com texto preliminar baseado nos números reais de cada loja.
 *
 * NÃO usa Anthropic API — texto é template estruturado a partir do DRE_BY_CONTA.
 * Pra relatórios analíticos completos: configurar ANTHROPIC_API_KEY e rodar
 * `node generate-report.cjs` (script existente do template).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Mock window/localStorage pra avaliar data.js
global.window = { BIT_FILTER: 'realizado' };
global.localStorage = { getItem: () => null, setItem: () => {} };
const dataJs = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
new Function(dataJs)();
const B = global.window.BIT;
const SEG = global.window.BIT_SEGMENTS || {};
const META = global.window.BIT_META || {};
const REF_YEAR = global.window.REF_YEAR;
const DBC = (B && B.DRE_BY_CONTA) || {};
const CONTAS = (B && B.CONTAS) || [];

const fmtBRL = (n) => 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n||0));
const fmtPct = (n) => (n>=0?'+':'') + (n||0).toFixed(1).replace('.', ',') + '%';
const MONTHS_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function buildSecoes({ empresa, dre, orc, segR, segP, isConta }) {
  const monthsActive = (dre || []).filter(m => m.count > 0);
  const monthsRealized = monthsActive.length;
  const totalRec = (dre||[]).reduce((s,m)=>s+m.receita, 0);
  const totalCus = (dre||[]).reduce((s,m)=>s+m.custo, 0);
  const totalDes = (dre||[]).reduce((s,m)=>s+m.despesa, 0);
  const totalImp = (dre||[]).reduce((s,m)=>s+m.imposto, 0);
  const totalLiq = totalRec - totalCus - totalDes - totalImp;
  const margem = totalRec > 0 ? (totalLiq / totalRec) * 100 : 0;
  const projLiq = totalLiq + ((orc?.liquido_mes||0) * (12 - monthsRealized));
  const aReceber = segP ? segP.KPIS.TOTAL_RECEITA : 0;
  const aPagar   = segP ? segP.KPIS.TOTAL_DESPESA : 0;

  // Tendência mês a mês
  const liqMes = monthsActive.map(m => m.liquido);
  const trendDesc = liqMes.length >= 2
    ? (liqMes[liqMes.length-1] < liqMes[0] ? 'queda consistente' : (liqMes[liqMes.length-1] > liqMes[0] ? 'recuperação' : 'estabilidade'))
    : 'dados insuficientes';

  const melhorMes = orc ? (MONTHS_FULL[orc.melhor_mes_idx||0] || '—') : '—';

  // Top categorias (receita+despesa) — só pro consolidado, pq por conta não temos seg breakdown
  const topRecCat = (segR?.RECEITA_CATEGORIAS || []).slice(0, 3);
  const topDespCat = (segR?.DESPESA_CATEGORIAS || []).slice(0, 3);

  const escopoLabel = isConta ? `da empresa ${empresa}` : 'consolidado das 24 empresas do Grupo DEX';
  const aviso = '\n\n_Este é um relatório PRELIMINAR gerado automaticamente a partir dos números do BI. Para análise narrativa profunda com IA, configure `ANTHROPIC_API_KEY` no servidor e rode `node generate-report.cjs`._';

  return {
    visao_geral: {
      title: 'Visão Geral',
      analysis: `O período de ${monthsRealized} ${monthsRealized === 1 ? 'mês' : 'meses'} de ${REF_YEAR} ${escopoLabel} fechou com receita realizada de ${fmtBRL(totalRec)} e despesa total (custo + despesa + imposto) de ${fmtBRL(totalCus + totalDes + totalImp)}, resultando em ${totalLiq >= 0 ? 'lucro' : 'prejuízo'} líquido de ${fmtBRL(totalLiq)} — margem de ${fmtPct(margem)}. A tendência mês a mês mostra ${trendDesc}.\n\nO orçamento construído sobre o melhor mês de receita (${melhorMes}, ${fmtBRL(orc?.receita_mes)}) projeta líquido mensal de ${fmtBRL(orc?.liquido_mes||0)} — anualizando para ${fmtBRL((orc?.liquido_mes||0)*12)}. A projeção de fechamento ${REF_YEAR} (real YTD + orçado dos meses restantes) indica ${fmtBRL(projLiq)}, ${projLiq >= 0 ? 'cenário positivo' : 'cenário de atenção'} caso a operação consiga retornar ao patamar do melhor mês histórico.${aviso}`,
    },
    receita: {
      title: 'Receita',
      analysis: `Receita realizada YTD: ${fmtBRL(totalRec)}. ${topRecCat.length ? `As principais categorias de entrada são ${topRecCat.map(c=>`${c.name} (${fmtBRL(c.value)})`).join(', ')}.` : 'Categorias detalhadas no extrato.'}\n\nA carteira a receber está em ${fmtBRL(aReceber)} — ${aReceber < totalRec * 0.1 ? 'ciclo de recebimento curto, característico de operação com forte componente cartão/PIX' : 'volume relevante de recebíveis em aberto, vale acompanhar aging'}. O orçamento mensal de receita é ${fmtBRL(orc?.receita_mes)}, baseado no mês mais forte do histórico realizado.`,
    },
    despesa: {
      title: 'Despesa',
      analysis: `O total de saídas foi ${fmtBRL(totalCus + totalDes + totalImp)}, decomposto em: custo variável ${fmtBRL(totalCus)} (${(totalRec>0?(totalCus/totalRec)*100:0).toFixed(0)}% da receita), despesa operacional ${fmtBRL(totalDes)} (${(totalRec>0?(totalDes/totalRec)*100:0).toFixed(0)}% da receita) e impostos ${fmtBRL(totalImp)} (${(totalRec>0?(totalImp/totalRec)*100:0).toFixed(0)}% da receita).\n\n${topDespCat.length ? `Top 3 categorias de despesa: ${topDespCat.map(c=>`${c.name} (${fmtBRL(c.value)})`).join(', ')}.` : ''} O passivo total a pagar (a vencer + atrasado) é ${fmtBRL(aPagar)} — ${aPagar > totalRec * 2 ? 'volume crítico que requer gestão ativa de aging por loja' : 'em linha com o ciclo da operação'}.`,
    },
    fluxo_caixa: {
      title: 'Fluxo de Caixa',
      analysis: `O fluxo mensal mostra: ${monthsActive.map(m => `${m.m} ${fmtBRL(m.liquido)}`).slice(0, 8).join(' · ')}. ${trendDesc === 'queda consistente' ? 'A tendência é de queda — receita não está sendo compensada por redução proporcional de gastos.' : trendDesc === 'recuperação' ? 'A tendência é de recuperação — operação está se ajustando.' : ''}\n\nProjetando os ${12 - monthsRealized} ${(12-monthsRealized) === 1 ? 'mês restante' : 'meses restantes'} pelo orçamento, o fechamento ${REF_YEAR} é estimado em ${fmtBRL(projLiq)}.`,
    },
    tesouraria: {
      title: 'Tesouraria',
      analysis: `Posição de tesouraria: ${fmtBRL(aReceber)} a receber vs ${fmtBRL(aPagar)} a pagar. Razão: ${aReceber > 0 ? (aPagar/Math.max(1,aReceber)).toFixed(0) : '—'}× mais obrigações que recebíveis previstos.\n\nRecomendação: classificar obrigações por urgência de vencimento, identificar credores estratégicos e renegociar prazos onde possível. Para operações com ciclo de caixa apertado, manter linha de crédito pré-aprovada de pelo menos 1.5× a despesa mensal média (~${fmtBRL((orc?.despesa_mes||0)*1.5)}).`,
    },
    comparativo: {
      title: 'Comparativo',
      analysis: `Comparando com o orçamento mensal: receita realizada média ${monthsRealized > 0 ? fmtBRL(totalRec/monthsRealized) : 'R$ 0'} vs orçada ${fmtBRL(orc?.receita_mes||0)} (${monthsRealized > 0 && orc?.receita_mes ? fmtPct(((totalRec/monthsRealized)/orc.receita_mes - 1) * 100) : '—'} de variação). Líquido médio realizado ${monthsRealized > 0 ? fmtBRL(totalLiq/monthsRealized) : 'R$ 0'} vs orçado ${fmtBRL(orc?.liquido_mes||0)}.\n\nO comparativo trimestral está disponível na tela "Comparativo" do menu principal, com decomposição por categoria.`,
    },
    conclusao: {
      title: 'Conclusão e Recomendações',
      analysis: `Resumo do período: ${totalLiq >= 0 ? 'operação no positivo' : `prejuízo de ${fmtBRL(-totalLiq)}`}, margem de ${fmtPct(margem)}, projeção de fechamento ${fmtBRL(projLiq)}.\n\n3 ações prioritárias:\n\n1. ${isConta ? 'Comparar performance desta empresa com a média do grupo no Painel de Lojas — identificar se está no top ou bottom quartile.' : 'Diagnóstico loja-a-loja imediato: usar Painel de Lojas + Risco & Concentração para identificar quais empresas concentram o prejuízo. A hipótese é que poucas lojas explicam a maior parte da deterioração — fechamento ou turnaround focado nessas pode reverter a tendência em 60-90 dias.'}\n\n2. Revisão do orçamento: o "melhor mês" como referência é otimista. Vale também construir cenário conservador (média dos meses) e cenário stress (pior mês × 0.9) para entender a sensibilidade do líquido a quedas de receita.\n\n3. Gestão ativa do passivo de ${fmtBRL(aPagar)}: classificar por aging, identificar credores estratégicos, renegociar prazos antes de qualquer atraso que multiplique custos via juros e multas.${aviso}`,
    },
  };
}

function buildReport({ empresa, periodo, dre, orc, segR, segP, isConta }) {
  return {
    empresa,
    periodo,
    generated_at: new Date().toISOString(),
    tipo: 'preliminar',
    secoes: buildSecoes({ empresa, dre, orc, segR, segP, isConta }),
  };
}

// === 1. Consolidado ===
const dreCons = B.MONTH_DRE || [];
const orcCons = B.ORCAMENTO || {};
const segR = SEG.realizado || B;
const segP = SEG.a_pagar_receber || B;
const monthsRealized = dreCons.filter(m => m.count > 0).length;
const monthsLabel = monthsRealized === 0 ? 'sem caixa em ' + REF_YEAR
  : monthsRealized === 12 ? `Janeiro a Dezembro ${REF_YEAR}`
  : `Janeiro a ${MONTHS_FULL[monthsRealized-1] || '?'} ${REF_YEAR} (YTD)`;

const reportConsolidado = buildReport({
  empresa: META.empresa?.nome_fantasia || 'Grupo DEX',
  periodo: monthsLabel,
  dre: dreCons,
  orc: orcCons,
  segR, segP,
  isConta: false,
});
fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(reportConsolidado, null, 2));
console.log('OK report.json (consolidado)');

// === 2. Por empresa ===
let n = 0;
for (const c of CONTAS) {
  const d = DBC[c.slug];
  if (!d) continue;
  const monthsActive = d.MONTH_DRE.filter(m => m.count > 0).length;
  const periodo = monthsActive === 0 ? `Sem caixa em ${REF_YEAR}` : `Janeiro a ${MONTHS_FULL[monthsActive-1]||'?'} ${REF_YEAR}`;
  const r = buildReport({
    empresa: c.label,
    periodo,
    dre: d.MONTH_DRE,
    orc: d.ORCAMENTO,
    segR: null, segP: null,
    isConta: true,
  });
  fs.writeFileSync(path.join(__dirname, `report-conta-${c.slug}.json`), JSON.stringify(r, null, 2));
  n++;
}
console.log(`OK ${n} reports por empresa`);
