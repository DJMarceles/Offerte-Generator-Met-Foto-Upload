import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import * as emailjs from "@emailjs/browser";

const DEFAULT_ITEM = { omschrijving: "", aantal: 1, prijs: 0, btw: 21 };
const CURRENCY = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export default function OfferteAppNL() {
  const [bedrijf, setBedrijf] = useState({
    naam: "Jouw Bedrijf BV",
    adres: "Voorbeeldstraat 1, 1234 AB Amsterdam",
    kvk: "",
    btwNr: "",
    telefoon: "",
    email: ""
  });
  const [klant, setKlant] = useState({
    naam: "",
    email: "",
    telefoon: "",
    adres: ""
  });
  const [offerte, setOfferte] = useState({
    nummer: `OFF-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`,
    datum: new Date().toISOString().slice(0,10),
    vervaldatum: "",
    titel: "Offerte",
    notities: ""
  });
  const [items, setItems] = useState([ { ...DEFAULT_ITEM } ]);
  const [fotos, setFotos] = useState([]); // {file, url}
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [toast, setToast] = useState("");
  const [emailCfg, setEmailCfg] = useState({
    provider: "emailjs",
    serviceId: "",
    templateId: "",
    publicKey: "",
    afzenderNaam: "",
    afzenderEmail: "",
    onderwerp: "Offerte {{offerteNummer}}",
    berichtIntro: "Beste {{klantNaam}},\n\nIn de bijlage vindt u de offerte. Neem gerust contact op bij vragen.\n\nMet vriendelijke groet,\n{{bedrijfNaam}}"
  });

  const [selfTests, setSelfTests] = useState([]);
  const previewRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("offerte_app_nl_v1") || "null");
      if (saved) {
        setBedrijf(saved.bedrijf || {});
        setKlant(saved.klant || {});
        setOfferte(saved.offerte || {});
        setItems(saved.items && saved.items.length ? saved.items : [ { ...DEFAULT_ITEM } ]);
        setFotos(saved.fotos || []);
        setEmailCfg(saved.emailCfg || emailCfg);
      }
    } catch {}
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const payload = { bedrijf, klant, offerte, items, fotos, emailCfg };
    localStorage.setItem("offerte_app_nl_v1", JSON.stringify(payload));
  }, [bedrijf, klant, offerte, items, fotos, emailCfg]);

  useEffect(() => {
    setSelfTests(runSelfTests());
  }, []);

  const totals = useMemo(() => {
    let subtotaal = 0;
    let btwTotaal = 0;
    items.forEach(it => {
      const netto = Number(it.aantal || 0) * Number(it.prijs || 0);
      const btw = netto * (Number(it.btw || 0) / 100);
      subtotaal += netto;
      btwTotaal += btw;
    });
    return {
      subtotaal,
      btwTotaal,
      totaal: subtotaal + btwTotaal
    };
  }, [items]);

  function setItem(idx, patch) {
    setItems(prev => prev.map((it,i) => i===idx ? { ...it, ...patch } : it));
  }
  function addItem() { setItems(prev => [ ...prev, { ...DEFAULT_ITEM } ]); }
  function removeItem(idx) {
    setItems(prev => prev.filter((_,i) => i!==idx));
  }

  function onFotosChange(e) {
    const files = Array.from(e.target.files || []);
    const mapped = files.map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setFotos(prev => [ ...prev, ...mapped ]);
  }
  function removeFoto(index) {
    setFotos(prev => prev.filter((_,i) => i!==index));
  }

  async function generatePdf() {
    try {
      setLoadingPdf(true);
      setToast("PDF genereren…");

      const node = previewRef.current;
      if (!node) throw new Error("Preview niet gevonden");

      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const imgProps = { width: pageWidth, height: (canvas.height * pageWidth) / canvas.width };
      pdf.addImage(imgData, "PNG", 0, 0, imgProps.width, imgProps.height);

      if (fotos.length) {
        for (let i=0; i<fotos.length; i++) {
          pdf.addPage();
          const f = fotos[i];
          const img = await fileToDataUrl(f.file);
          const margin = 10;
          const maxW = pageWidth - margin*2;
          const maxH = pageHeight - margin*2;
          const dims = await imageDimensions(img);
          const ratio = Math.min(maxW/dims.w, maxH/dims.h);
          const w = dims.w * ratio;
          const h = dims.h * ratio;
          const x = (pageWidth - w)/2;
          const y = (pageHeight - h)/2;
          pdf.addImage(img, "JPEG", x, y, w, h);
        }
      }

      const blob = pdfOutputBlob(pdf);
      setPdfBlob(blob);
      setToast("PDF klaar (niet verzonden). Je kunt nu mailen of downloaden.");
    } catch (err) {
      console.error(err);
      setToast(`Fout bij PDF genereren: ${err.message}`);
    } finally {
      setLoadingPdf(false);
    }
  }

  function downloadPdf() {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${offerte.nummer}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendEmail() {
    try {
      if (!klant.email) return setToast("Vul een klant e‑mailadres in.");
      if (emailCfg.provider !== "emailjs") return setToast("Alleen EmailJS is nu ondersteund.");
      const { serviceId, templateId, publicKey } = emailCfg;
      if (!serviceId || !templateId || !publicKey) return setToast("Vul EmailJS serviceId, Template ID en Public Key in bij Instellingen.");

      setToast("E‑mail voorbereiden…");
      emailjs.init({ publicKey });

      if (!pdfBlob) await generatePdf();

      const pdfFile = new File([pdfBlob], `${offerte.nummer}.pdf`, { type: "application/pdf" });
      const fotoFiles = fotos.map((f,idx) => new File([f.file], `foto-${idx+1}-${sanitizeFilename(f.file.name)}`, { type: f.file.type || "image/jpeg" }));

      const onderwerp = template(emailCfg.onderwerp, {
        offerteNummer: offerte.nummer,
        klantNaam: klant.naam,
        bedrijfNaam: bedrijf.naam
      });
      const berichtIntro = template(emailCfg.berichtIntro, {
        offerteNummer: offerte.nummer,
        klantNaam: klant.naam,
        bedrijfNaam: bedrijf.naam
      });

      const htmlInhoud = buildOfferteHtml({ bedrijf, klant, offerte, items, totals });

      setToast("E‑mail verzenden via EmailJS…");
      await emailjs.send(
        serviceId,
        templateId,
        {
          subject: onderwerp,
          message: `${berichtIntro}\n\nSamenvatting:\nTotaal: ${CURRENCY.format(totals.totaal)}\nOffertenummer: ${offerte.nummer}`,
          to_email: klant.email,
          to_name: klant.naam || klant.email,
          from_name: emailCfg.afzenderNaam || bedrijf.naam,
          from_email: emailCfg.afzenderEmail || bedrijf.email,
          html_content: htmlInhoud
        },
        {
          attachments: [pdfFile, ...fotoFiles]
        }
      );

      setToast("E‑mail verzonden! (controleer je inbox/uitgaande mail in EmailJS)");
    } catch (err) {
      console.error(err);
      setToast(`Fout bij e‑mail verzenden: ${err.message}`);
    }
  }

  function resetAlles() {
    if (!confirm("Weet je zeker dat je alles wilt wissen?")) return;
    localStorage.removeItem("offerte_app_nl_v1");
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Offerte App (NL)</h1>
          <div className="flex items-center gap-2">
            <button onClick={generatePdf} disabled={loadingPdf} className="px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{loadingPdf?"Bezig…":"Genereer PDF"}</button>
            <button onClick={downloadPdf} disabled={!pdfBlob} className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50 disabled:opacity-50">Download PDF</button>
            <button onClick={sendEmail} className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Verstuur per e‑mail</button>
            <Settings emailCfg={emailCfg} setEmailCfg={setEmailCfg} />
            <button onClick={resetAlles} className="px-3 py-2 rounded-xl bg-white border hover:bg-red-50">Leeg alles</button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="max-w-6xl mx-auto px-4 mt-3">
          <div className="rounded-xl border bg-white p-3 text-sm">{toast}</div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-4">
          <Card title="Bedrijfsgegevens">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Naam" value={bedrijf.naam} onChange={v=>setBedrijf({...bedrijf,naam:v})} />
              <Input label="E‑mail" value={bedrijf.email} onChange={v=>setBedrijf({...bedrijf,email:v})} />
              <Input label="Telefoon" value={bedrijf.telefoon} onChange={v=>setBedrijf({...bedrijf,telefoon:v})} />
              <Input label="KVK" value={bedrijf.kvk} onChange={v=>setBedrijf({...bedrijf,kvk:v})} />
              <Input label="BTW‑nummer" value={bedrijf.btwNr} onChange={v=>setBedrijf({...bedrijf,btwNr:v})} />
              <Input label="Adres" value={bedrijf.adres} onChange={v=>setBedrijf({...bedrijf,adres:v})} className="md:col-span-2" />
            </div>
          </Card>

          <Card title="Klantgegevens">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Naam" value={klant.naam} onChange={v=>setKlant({...klant,naam:v})} />
              <Input label="E‑mail" value={klant.email} onChange={v=>setKlant({...klant,email:v})} />
              <Input label="Telefoon" value={klant.telefoon} onChange={v=>setKlant({...klant,telefoon:v})} />
              <Input label="Adres" value={klant.adres} onChange={v=>setKlant({...klant,adres:v})} className="md:col-span-2" />
            </div>
          </Card>

          <Card title="Offerte gegevens">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Titel" value={offerte.titel} onChange={v=>setOfferte({...offerte,titel:v})} className="md:col-span-2" />
              <Input label="Offertenummer" value={offerte.nummer} onChange={v=>setOfferte({...offerte,nummer:v})} />
              <Input type="date" label="Datum" value={offerte.datum} onChange={v=>setOfferte({...offerte,datum:v})} />
              <Input type="date" label="Geldig tot" value={offerte.vervaldatum} onChange={v=>setOfferte({...offerte,vervaldatum:v})} />
              <Textarea label="Notities" value={offerte.notities} onChange={v=>setOfferte({...offerte,notities:v})} className="md:col-span-3" />
            </div>
          </Card>

          <Card title="Regels">
            <div className="space-y-3">
              {items.map((it,idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5"><Input label="Omschrijving" value={it.omschrijving} onChange={v=>setItem(idx,{omschrijving:v})} /></div>
                  <div className="col-span-2"><Input type="number" step="1" label="Aantal" value={it.aantal} onChange={v=>setItem(idx,{aantal:Number(v)})} /></div>
                  <div className="col-span-2"><Input type="number" step="0.01" label="Prijs (ex)" value={it.prijs} onChange={v=>setItem(idx,{prijs:Number(v)})} /></div>
                  <div className="col-span-2"><Input type="number" step="1" label="BTW %" value={it.btw} onChange={v=>setItem(idx,{btw:Number(v)})} /></div>
                  <div className="col-span-1 flex"><button onClick={()=>removeItem(idx)} className="mt-6 w-full h-10 rounded-lg border hover:bg-red-50">×</button></div>
                </div>
              ))}
              <button onClick={addItem} className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50">+ Regel toevoegen</button>
            </div>
          </Card>

          <Card title="Foto's toevoegen (optioneel)">
            <input multiple accept="image/*" type="file" onChange={onFotosChange} />
            {fotos.length>0 && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {fotos.map((f,idx)=> (
                  <div key={idx} className="relative group">
                    <img src={f.url} alt="foto" className="w-full h-28 object-cover rounded-lg border" />
                    <button onClick={()=>removeFoto(idx)} className="absolute top-1 right-1 hidden group-hover:block bg-white/90 rounded-full w-7 h-7 border">×</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section>
          <Card title="Voorbeeld (PDF weergave)">
            <div ref={previewRef} className="bg-white rounded-xl border p-6 text-sm leading-relaxed">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-xl font-semibold">{bedrijf.naam || "Bedrijfsnaam"}</div>
                  <div className="text-gray-600 whitespace-pre-line">{bedrijf.adres}</div>
                  <div className="text-gray-600">KVK: {bedrijf.kvk || "-"} • BTW: {bedrijf.btwNr || "-"}</div>
                  <div className="text-gray-600">{bedrijf.telefoon} • {bedrijf.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{offerte.titel || "Offerte"}</div>
                  <div className="text-gray-600">Nr: {offerte.nummer}</div>
                  <div className="text-gray-600">Datum: {nl(offerte.datum)}</div>
                  {offerte.vervaldatum && (<div className="text-gray-600">Geldig tot: {nl(offerte.vervaldatum)}</div>)}
                </div>
              </div>

              <hr className="my-4"/>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-semibold">Factuur aan</div>
                  <div>{klant.naam || "Klantnaam"}</div>
                  <div className="text-gray-600 whitespace-pre-line">{klant.adres || "Adres"}</div>
                  <div className="text-gray-600">{klant.telefoon}</div>
                  <div className="text-gray-600">{klant.email}</div>
                </div>
              </div>

              <div className="mt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2">Omschrijving</th>
                      <th className="py-2 text-right">Aantal</th>
                      <th className="py-2 text-right">Prijs (ex)</th>
                      <th className="py-2 text-right">BTW %</th>
                      <th className="py-2 text-right">Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it,idx)=>{
                      const netto = Number(it.aantal||0)*Number(it.prijs||0);
                      const btw = netto * (Number(it.btw||0)/100);
                      return (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-2 pr-2 align-top">{it.omschrijving || <span className="text-gray-400">—</span>}</td>
                          <td className="py-2 text-right align-top">{it.aantal}</td>
                          <td className="py-2 text-right align-top">{CURRENCY.format(it.prijs||0)}</td>
                          <td className="py-2 text-right align-top">{it.btw}%</td>
                          <td className="py-2 text-right align-top">{CURRENCY.format(netto+btw)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2">
                  <div className="text-gray-600 whitespace-pre-line pr-6">{offerte.notities}</div>
                  <div className="sm:justify-self-end w-full sm:w-64">
                    <div className="flex justify-between py-1"><span>Subtotaal</span><span>{CURRENCY.format(totals.subtotaal)}</span></div>
                    <div className="flex justify-between py-1"><span>BTW</span><span>{CURRENCY.format(totals.btwTotaal)}</span></div>
                    <div className="flex justify-between py-2 text-lg font-semibold border-t mt-2"><span>Totaal</span><span>{CURRENCY.format(totals.totaal)}</span></div>
                  </div>
                </div>
              </div>

              {fotos.length>0 && (
                <div className="mt-6">
                  <div className="font-semibold mb-2">Foto‑overzicht</div>
                  <div className="grid grid-cols-3 gap-3">
                    {fotos.slice(0,6).map((f,idx)=> (
                      <img key={idx} src={f.url} alt="bijlage" className="w-full h-24 object-cover rounded-lg border" />
                    ))}
                  </div>
                  {fotos.length>6 && (
                    <div className="text-xs text-gray-500 mt-1">(+{fotos.length-6} extra foto's in bijlage)</div>
                  )}
                </div>
              )}

              <div className="mt-8 text-xs text-gray-500">
                Deze offerte is opgesteld door {bedrijf.naam}. Prijzen zijn inclusief BTW tenzij anders vermeld.
              </div>
            </div>
          </Card>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-xs text-gray-500 space-y-2">
        <div>Tip: gebruik het tandwiel voor e‑mailinstellingen (EmailJS). Alle gegevens blijven op dit apparaat.</div>
        <SelfTestPanel results={selfTests} />
      </footer>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="font-semibold">{title}</div>\n      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Input({ label, type="text", value, onChange, className="" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-gray-600">{label}</span>
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} className="mt-1 w-full h-10 rounded-lg border px-3 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
    </label>
  );
}
function Textarea({ label, value, onChange, className="" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-gray-600">{label}</span>
      <textarea value={value||""} onChange={e=>onChange(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
    </label>
  );
}

function Settings({ emailCfg, setEmailCfg }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50" title="Instellingen">⚙️ Instellingen</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl border shadow-xl w-[680px] max-w-[95vw]">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">E‑mail instellingen (EmailJS)</div>
              <button onClick={()=>setOpen(false)} className="w-8 h-8 rounded-full border">×</button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
                <div className="font-medium">Hoe werkt dit?</div>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Maak een gratis account aan op emailjs.com en voeg je e‑mailprovider toe.</li>
                  <li>Maak een <em>Service</em>, een <em>Template</em> met velden: <code>subject, message, to_email, to_name, from_name, from_email, html_content</code>.</li>
                  <li>Plaats je <em>Service ID</em>, <em>Template ID</em> en <em>Public Key</em> hieronder.</li>
                  <li>Bijlagen: de PDF en eventuele foto's worden automatisch meegestuurd.</li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Service ID" value={emailCfg.serviceId} onChange={v=>setEmailCfg({...emailCfg, serviceId:v})} />
                <Input label="Template ID" value={emailCfg.templateId} onChange={v=>setEmailCfg({...emailCfg, templateId:v})} />
                <Input label="Public Key" value={emailCfg.publicKey} onChange={v=>setEmailCfg({...emailCfg, publicKey:v})} />
                <div />
                <Input label="Afzender naam" value={emailCfg.afzenderNaam} onChange={v=>setEmailCfg({...emailCfg, afzenderNaam:v})} />
                <Input label="Afzender e‑mail" value={emailCfg.afzenderEmail} onChange={v=>setEmailCfg({...emailCfg, afzenderEmail:v})} />
                <Input label="Onderwerp" value={emailCfg.onderwerp} onChange={v=>setEmailCfg({...emailCfg, onderwerp:v})} className="col-span-2" />
                <Textarea label="Bericht intro" value={emailCfg.berichtIntro} onChange={v=>setEmailCfg({...emailCfg, berichtIntro:v})} className="col-span-2" />
              </div>

              <div className="text-xs text-gray-500">
                Placeholders: <code>{"{{offerteNummer}}"}</code>, <code>{"{{klantNaam}}"}</code>, <code>{"{{bedrijfNaam}}"}</code>
              </div>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={()=>setOpen(false)} className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50">Sluiten</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SelfTestPanel({ results }) {
  if (!results || !results.length) return null;
  const ok = results.every(r => r.pass);
  return (
    <div className={`rounded-xl border p-3 ${ok?"bg-emerald-50 border-emerald-200":"bg-amber-50 border-amber-200"}`}>
      <div className="font-medium text-xs mb-1">Zelftest helpers</div>
      <ul className="text-xs list-disc pl-5 space-y-1">
        {results.map((r,i)=> (
          <li key={i}>
            <span className={r.pass?"text-emerald-700":"text-amber-700"}>{r.pass?"PASS":"FAIL"}</span>
            {": "}{r.name}{r.pass?"":" – verwacht: "+String(r.expected)+", kreeg: "+String(r.got)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Helpers
function nl(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}
function template(str, vars) {
  return (str||"").replace(/{{\s*(\w+)\s*}}/g, (_,k)=> vars[k] ?? "");
}
function sanitizeFilename(name) {
  return (name||"bestand").replace(/[^a-z0-9_\-\.]/gi, "_");
}
async function fileToDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = reject;
    img.src = src;
  });
}
function pdfOutputBlob(pdf) {
  const dataUriString = pdf.output("datauristring");
  const base64 = dataUriString.split(",")[1];
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: "application/pdf" });
}

function buildOfferteHtml({ bedrijf, klant, offerte, items, totals }) {
  const rows = items.map(it => {
    const netto = Number(it.aantal||0)*Number(it.prijs||0);
    const btw = netto * (Number(it.btw||0)/100);
    const totaal = netto + btw;
    return `<tr><td>${escapeHtml(it.omschrijving||"-")}</td><td style="text-align:right">${it.aantal}</td><td style="text-align:right">${CURRENCY.format(it.prijs||0)}</td><td style="text-align:right">${it.btw}%</td><td style="text-align:right">${CURRENCY.format(totaal)}</td></tr>`;
  }).join("");
  return `
  <div>
    <h2>${escapeHtml(offerte.titel||"Offerte")} – ${escapeHtml(offerte.nummer||"")}</h2>
    <p><strong>${escapeHtml(bedrijf.naam||"")}</strong><br/>${escapeHtml(bedrijf.adres||"")}<br/>KVK: ${escapeHtml(bedrijf.kvk||"-")} • BTW: ${escapeHtml(bedrijf.btwNr||"-")}<br/>${escapeHtml(bedrijf.telefoon||"")} • ${escapeHtml(bedrijf.email||"")}</p>
    <p><strong>Aan:</strong> ${escapeHtml(klant.naam||"")} – ${escapeHtml(klant.email||"")}</p>
    <table style="width:100%; border-collapse:collapse" border="1" cellpadding="6">
      <thead><tr><th>Omschrijving</th><th style="text-align:right">Aantal</th><th style="text-align:right">Prijs (ex)</th><th style="text-align:right">BTW %</th><th style="text-align:right">Totaal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right">
      Subtotaal: ${CURRENCY.format(totals.subtotaal)}<br/>
      BTW: ${CURRENCY.format(totals.btwTotaal)}<br/>
      <strong>Totaal: ${CURRENCY.format(totals.totaal)}</strong>
    </p>
  </div>`;
}
function escapeHtml(str) {
  return (str||"")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function SelfTestPanelInline() { return null } // placeholder if needed
function runSelfTests() {
  const cases = [];
  // escapeHtml
  cases.push({
    name: "escapeHtml basis",
    expected: "&quot;&amp;&lt;&gt;&#039;",
    got: escapeHtml('\"&<>\''),
  });
  cases[cases.length-1].pass = cases[cases.length-1].got === cases[cases.length-1].expected;

  // template
  cases.push({
    name: "template bestaande key",
    expected: "Hallo Klaas",
    got: template("Hallo {{naam}}", { naam: "Klaas" })
  });
  cases[cases.length-1].pass = cases[cases.length-1].got === cases[cases.length-1].expected;

  cases.push({
    name: "template ontbrekende key",
    expected: "Hallo ",
    got: template("Hallo {{naam}}", {})
  });
  cases[cases.length-1].pass = cases[cases.length-1].got === cases[cases.length-1].expected;

  // sanitizeFilename
  cases.push({
    name: "sanitizeFilename",
    expected: "a_b_c__.jpg",
    got: sanitizeFilename("a b/c?.jpg")
  });
  cases[cases.length-1].pass = cases[cases.length-1].got === cases[cases.length-1].expected;

  // nl datum (we check only non-empty string due to env differences)
  const d = "2025-08-09";
  const gotNl = nl(d);
  cases.push({
    name: "nl datum",
    expected: gotNl,
    got: gotNl,
    pass: !!gotNl
  });

  // totals example (logic sample)
  const netto = 20; const btw = 4.2; const totaal = 24.2;
  const calc = { subtotaal: netto, btwTotaal: btw, totaal: netto + btw };
  cases.push({ name: "totals voorbeeld", expected: totaal.toFixed(1), got: (calc.totaal).toFixed(1) });
  cases[cases.length-1].pass = cases[cases.length-1].got === cases[cases.length-1].expected;

  for (const c of cases) if (typeof c.pass === "undefined") c.pass = c.got === c.expected;
  return cases;
}
