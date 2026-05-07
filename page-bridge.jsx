/* PageBridge — Margin Bridge / Waterfall (P&L visual)
 *
 * Cascata: Receita → CMV → Margem Bruta → OPEX (Aluguel, Salários, Outras) → EBITDA → Imposto → Líquido
 * Reage a drilldown.type='conta' (uma loja). Comparativo lateral vs benchmark da MARCA.
 */

const PageBridge = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const isContaFilter = drilldown && drilldown.type === 'conta';
  const contaSlug = isContaFilter ? drilldown.value : null;
  const ALL_TX = window.ALL_TX || [];
  const B = window.BIT || {};
  const DBC = B.DRE_BY_CONTA || {};

  // Decompõe despesa em Aluguel / Salários / Outras filtrando categorias do ALL_TX
  // ALL_TX tuple: [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, cc, conta_slug]
  const _hojeBR = new Date();
  const _mesCorrenteBR = `${_hojeBR.getFullYear()}-${String(_hojeBR.getMonth()+1).padStart(2,"0")}`;

  const decompose = (slug) => {
    let receita = 0, custo = 0, imposto = 0;
    let aluguel = 0, salarios = 0, outrasDesp = 0;
    for (const r of ALL_TX) {
      if (r[6] !== 1) continue; // só realizado
      if (slug && r[9] !== slug) continue;
      if (!r[1] || r[1] >= _mesCorrenteBR) continue;  // exclui mês corrente
      const cat = (r[3] || "").toUpperCase();
      const v = r[5];
      if (r[0] === 'r') {
        receita += v;
        continue;
      }
      // Despesa: classificar pela categoria + pela seção do build-data
      // (A seção real está no MONTH_DRE, mas não no tuple. Usamos heurística:
      //  custo se categoria começa com COMPRAS/MERCADORIA/CMV/MATERIA/INSUMO/ROYALTI/REPASS/FRETE/SERVICOS DE ENTREGA/COMISS/DEVOLU
      //  imposto se contém ICMS/ISS/COFINS/PIS/SIMPLES/DAS/IOF/IRPJ/CSLL
      //  aluguel se contém ALUGUEL/LOCACAO
      //  salarios se contém SALARI/FOLHA/INSS/FGTS/13/RESCIS/VALE/FERIAS
      //  resto vai pra outras
      if (/COMPRAS|MERCADORIA|CMV|MATERIA.PRIMA|INSUMO|ROYALT|REPASS|^FRETE|SERVICOS DE ENTREGA|^COMISS|DEVOLU/.test(cat)) {
        custo += v;
      } else if (/ICMS|\bISS\b|COFINS|\bPIS\b|SIMPLES|\bDAS\b|\bIOF\b|IRPJ|CSLL/.test(cat)) {
        imposto += v;
      } else if (/ALUGUEL|LOCACAO|LOCAÇÃO/.test(cat)) {
        aluguel += v;
      } else if (/SALARI|FOLHA|\bINSS\b|FGTS|^13|RESCIS|VALE|FÉRIAS|FERIAS/.test(cat)) {
        salarios += v;
      } else {
        outrasDesp += v;
      }
    }
    const margemBruta = receita - custo;
    const ebitda = margemBruta - aluguel - salarios - outrasDesp;
    const liquido = ebitda - imposto;
    return { receita, custo, margemBruta, aluguel, salarios, outrasDesp, ebitda, imposto, liquido };
  };

  const data = useMemo(() => decompose(contaSlug), [contaSlug, ALL_TX, REF_YEAR]);

  // Benchmark intra-marca (se conta filtrada): média das outras lojas da mesma marca
  const benchmark = useMemo(() => {
    if (!isContaFilter) return null;
    const targetMarca = window.inferMarca ? window.inferMarca(drilldown.label) : null;
    if (!targetMarca) return null;
    const peers = (B.CONTAS || []).filter(c => c.slug !== contaSlug && window.inferMarca(c.label) === targetMarca);
    if (peers.length === 0) return null;
    const decomps = peers.map(p => decompose(p.slug));
    const sumRec = decomps.reduce((s,d) => s + d.receita, 0);
    if (sumRec === 0) return null;
    return {
      marca: targetMarca,
      n: peers.length,
      // ratios % de receita
      pCusto: decomps.reduce((s,d) => s + d.custo, 0) / sumRec * 100,
      pAluguel: decomps.reduce((s,d) => s + d.aluguel, 0) / sumRec * 100,
      pSalarios: decomps.reduce((s,d) => s + d.salarios, 0) / sumRec * 100,
      pOutras: decomps.reduce((s,d) => s + d.outrasDesp, 0) / sumRec * 100,
      pImposto: decomps.reduce((s,d) => s + d.imposto, 0) / sumRec * 100,
      pMargemBruta: decomps.reduce((s,d) => s + d.margemBruta, 0) / sumRec * 100,
      pEbitda: decomps.reduce((s,d) => s + d.ebitda, 0) / sumRec * 100,
      pLiquido: decomps.reduce((s,d) => s + d.liquido, 0) / sumRec * 100,
    };
  }, [isContaFilter, contaSlug, drilldown, B.CONTAS, ALL_TX, REF_YEAR]);

  const pct = (v, total) => total > 0 ? (v / total) * 100 : 0;
  const fmtPct = (n) => (n||0).toFixed(1).replace(".",",")+"%";

  // Waterfall data
  const steps = [
    { label: "Receita", val: data.receita, type: "start" },
    { label: "(–) CMV", val: -data.custo, type: "neg" },
    { label: "Margem Bruta", val: data.margemBruta, type: "subtotal" },
    { label: "(–) Aluguel", val: -data.aluguel, type: "neg" },
    { label: "(–) Salários", val: -data.salarios, type: "neg" },
    { label: "(–) Outras desp", val: -data.outrasDesp, type: "neg" },
    { label: "EBITDA", val: data.ebitda, type: "subtotal" },
    { label: "(–) Imposto", val: -data.imposto, type: "neg" },
    { label: "Líquido", val: data.liquido, type: "end" },
  ];

  // Constrói cumulativo pro waterfall
  let acc = 0;
  const layout = steps.map((s, i) => {
    const isAbsolute = s.type === "start" || s.type === "subtotal" || s.type === "end";
    const startY = isAbsolute ? 0 : acc;
    const endY = isAbsolute ? s.val : acc + s.val;
    if (!isAbsolute) acc += s.val;
    else acc = s.val;
    return { ...s, startY, endY };
  });

  // SVG waterfall
  const W = 760, H = 360, ml = 50, mr = 14, mt = 30, mb = 70;
  const cw = W - ml - mr, ch = H - mt - mb;
  const allVals = layout.flatMap(s => [s.startY, s.endY]);
  const maxV = Math.max(0, ...allVals);
  const minV = Math.min(0, ...allVals);
  const range = (maxV - minV) || 1;
  const slot = cw / steps.length;
  const barW = slot * 0.65;
  const x = (i) => ml + i*slot + (slot - barW)/2;
  const y = (v) => mt + ch - ((v - minV) / range) * ch;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Margin Bridge · {REF_YEAR}{isContaFilter ? ` · ${drilldown.label}` : " · Consolidado"}</h1>
          <div className="status-line">
            Decomposição P&amp;L: Receita → CMV → Margem Bruta → Aluguel/Salários/Outras → EBITDA → Imposto → Líquido.
            {benchmark && <span> Comparado contra média de {benchmark.n} {benchmark.n === 1 ? "loja" : "lojas"} {benchmark.marca}.</span>}
          </div>
        </div>
      </div>

      {setDrilldown && drilldown && <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />}

      <div className="card">
        <h2 className="card-title">Cascata waterfall</h2>
        <div style={{ width: "100%", maxWidth: W, overflowX: "auto" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", minWidth: 600, height: "auto" }}>
            {/* grid */}
            {[0, maxV/2, maxV, minV/2 < 0 ? minV/2 : null, minV < 0 ? minV : null].filter(v => v != null).map((v,i) => (
              <g key={i}>
                <line x1={ml} y1={y(v)} x2={W-mr} y2={y(v)} stroke="var(--border)" strokeDasharray="3,3" />
                <text x={ml-5} y={y(v)+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtCompact(v)}</text>
              </g>
            ))}
            {minV < 0 && (
              <line x1={ml} y1={y(0)} x2={W-mr} y2={y(0)} stroke="var(--fg-3)" strokeWidth={1} />
            )}
            {/* Barras */}
            {layout.map((s, i) => {
              const yTop = Math.min(y(s.startY), y(s.endY));
              const h = Math.max(2, Math.abs(y(s.endY) - y(s.startY)));
              let fill = "var(--cyan)";
              if (s.type === "neg") fill = "var(--red)";
              else if (s.type === "subtotal") fill = "var(--amber)";
              else if (s.type === "end") fill = s.val >= 0 ? "var(--green)" : "var(--red)";
              return (
                <g key={i}>
                  <rect x={x(i)} y={yTop} width={barW} height={h} fill={fill} opacity={0.85} rx={2} />
                  <text x={x(i) + barW/2} y={yTop - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--fg)">{fmtCompact(s.val)}</text>
                  <text x={x(i) + barW/2} y={yTop - 16} textAnchor="middle" fontSize="9" fill="var(--fg-3)">
                    {pct(s.type === "neg" ? -s.val : s.val, data.receita).toFixed(0)}%
                  </text>
                  {/* Linha de conexão */}
                  {i > 0 && layout[i-1].type !== "subtotal" && layout[i-1].type !== "end" && s.type !== "subtotal" && s.type !== "end" && (
                    <line x1={x(i-1) + barW} y1={y(layout[i-1].endY)} x2={x(i)} y2={y(s.startY)} stroke="var(--fg-3)" strokeDasharray="2,2" strokeWidth={0.7} />
                  )}
                  <text x={x(i) + barW/2} y={H-50} textAnchor="middle" fontSize="10" fill="var(--fg-2)" transform={`rotate(-25 ${x(i)+barW/2} ${H-50})`}>{s.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Tabela P&L vertical com benchmark */}
      <div className="card">
        <h2 className="card-title">P&amp;L verticalizado · % da receita {benchmark ? `· vs benchmark ${benchmark.marca}` : ""}</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>Linha</th>
                <th className="num">Valor</th>
                <th className="num">% Receita</th>
                {benchmark && <th className="num">Bench {benchmark.marca}</th>}
                {benchmark && <th className="num">Δ vs bench</th>}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Receita", val: data.receita, neg: false, p: 100, bench: 100 },
                { label: "(–) CMV", val: data.custo, neg: true, p: pct(data.custo, data.receita), bench: benchmark?.pCusto },
                { label: "Margem Bruta", val: data.margemBruta, sub: true, p: pct(data.margemBruta, data.receita), bench: benchmark?.pMargemBruta, isPos: true },
                { label: "(–) Aluguel", val: data.aluguel, neg: true, p: pct(data.aluguel, data.receita), bench: benchmark?.pAluguel },
                { label: "(–) Salários", val: data.salarios, neg: true, p: pct(data.salarios, data.receita), bench: benchmark?.pSalarios },
                { label: "(–) Outras desp", val: data.outrasDesp, neg: true, p: pct(data.outrasDesp, data.receita), bench: benchmark?.pOutras },
                { label: "EBITDA", val: data.ebitda, sub: true, p: pct(data.ebitda, data.receita), bench: benchmark?.pEbitda, isPos: true },
                { label: "(–) Imposto", val: data.imposto, neg: true, p: pct(data.imposto, data.receita), bench: benchmark?.pImposto },
                { label: "Líquido", val: data.liquido, end: true, p: pct(data.liquido, data.receita), bench: benchmark?.pLiquido, isPos: true },
              ].map((r, i) => {
                const delta = (benchmark && r.bench != null) ? r.p - r.bench : null;
                // Para custos (neg), Δ positivo é RUIM (gastando mais que peers)
                // Para receita/margens (isPos), Δ positivo é BOM
                const dColor = delta == null ? "var(--fg-3)"
                  : (r.neg ? (delta > 0 ? "var(--red)" : "var(--green)") : (delta >= 0 ? "var(--green)" : "var(--red)"));
                const valColor = r.isPos ? (r.val >= 0 ? "var(--green)" : "var(--red)")
                                : (r.neg ? "var(--red)" : "var(--cyan)");
                return (
                  <tr key={i} style={{ background: r.sub || r.end ? "rgba(34,211,238,0.05)" : "transparent", fontWeight: r.sub || r.end ? 700 : 400 }}>
                    <td>{r.label}</td>
                    <td className="num" style={{ color: valColor }}>{fmtCompact(r.val)}</td>
                    <td className="num">{r.p.toFixed(1).replace(".",",")}%</td>
                    {benchmark && <td className="num" style={{ color: "var(--fg-3)" }}>{r.bench != null ? r.bench.toFixed(1).replace(".",",")+"%" : "—"}</td>}
                    {benchmark && <td className="num" style={{ color: dColor, fontWeight: 600 }}>{delta == null ? "—" : (delta >= 0 ? "+" : "") + delta.toFixed(1).replace(".",",")+"pp"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {benchmark && (
          <div className="status-line" style={{ marginTop: 8, fontSize: 11 }}>
            <b>Δ vs bench</b> em pontos percentuais sobre receita. Para custos: Δ positivo = gastando mais que peers (vermelho). Para margens: Δ positivo = melhor que peers (verde).
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { PageBridge });
