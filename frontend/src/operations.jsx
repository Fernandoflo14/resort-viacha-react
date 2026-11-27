import React, { useEffect, useState } from 'react';
import { booking, request } from './api.js';
import { dateLabel, plusDays, price, today } from './dates.js';
import { paymentNames, useResource } from './experiences.jsx';

function PaymentActions({ row, session, changed }) {
  const [expanded, open] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const events = useResource(expanded ? booking + '/operations/payments/' + row.id : null, session.token);
  const isRefund = row.status === 'reembolso_pendiente';
  const actionable = row.status === 'pendiente' || isRefund;

  async function submit(event) {
    event.preventDefault();
    const reference = new FormData(event.currentTarget).get('reference');
    setBusy(true);
    setNotice('');
    try {
      await request(booking + '/operations/payments/' + row.id, {
        method: 'POST', token: session.token, data: { action: isRefund ? 'reembolsar' : 'cobrar', reference },
      });
      changed(isRefund ? 'Reembolso registrado.' : 'Cobro registrado.');
    } catch (error) {
      session.expire(error);
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="payment-actions">
    <button className="text-button" aria-expanded={expanded} onClick={() => open(!expanded)}>
      {expanded ? 'Ocultar' : actionable ? 'Gestionar pago' : 'Ver movimientos'}
    </button>
    {expanded && <div className="payment-detail">
      {events.error ? <p role="alert">{events.error.message}</p> : !events.data ? <p role="status">Consultando movimientos.</p> :
        events.data.events.length ? <ul>{events.data.events.map(item => <li key={item.id}>
          {paymentNames[item.status]} � {item.created_at.slice(0, 10)} � Cuenta {item.actor_id}
          {item.reference && <strong> � {item.reference}</strong>}
        </li>)}</ul> : <p>Sin movimientos verificados.</p>}
      {actionable && <form className="form-stack" onSubmit={submit}>
        <label>Referencia del comprobante<input name="reference" minLength={3} maxLength={60} required /></label>
        <p className="muted">{isRefund ? 'Confirma solo si ya realizaste la devoluci�n.' : 'Confirma solo si ya recibiste el importe.'}</p>
        <button disabled={busy} className="button">{busy ? 'Registrando.' : isRefund ? 'Registrar reembolso' : 'Registrar cobro'}</button>
      </form>}
      {notice && <p className="notice error" role="alert">{notice}</p>}
    </div>}
  </div>;
}

export function Operations({ session }) {
  const [range, setRange] = useState(() => ({ from: today().slice(0, 7) + '-01', to: plusDays(today(), 30) }));
  const [version, refresh] = useState(0);
  const [notice, setNotice] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const role = session.user?.role;
  const access = ['admin','staff','finance','manager'].includes(role);
  const params = new URLSearchParams(range).toString();
  const report = useResource(access ? booking + '/operations/history?' + params : null, session.token, version);
  const data = report.data;
  useEffect(() => { if (report.error) session.expire(report.error); }, [report.error]);

  async function download() {
    setNotice(null);
    setDownloading(true);
    try {
      const response = await fetch(booking + '/operations/history.pdf?' + params, { headers: { Authorization: 'Bearer ' + session.token } });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        const payload = await response.json().catch(() => null);
        throw Object.assign(new Error(payload?.message || 'No se pudo descargar el informe.'), { status: response.status });
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'historial-' + range.from + '-' + range.to + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      session.expire(error);
      setNotice({ text: error.message, error: true });
    } finally {
      setDownloading(false);
    }
  }

  return <section className="wrap page">
    <div className="page-heading"><p className="overline">PARADISE RESORT</p><h1>{role === 'admin' ? 'Administraci�n' : 'Recepci�n'}</h1>
      <p>Consulta reservas, registra cobros y da seguimiento a devoluciones.</p></div>
    {session.checking ? <p role="status">Verificando tu sesi�n.</p> : !access ?
      <div className="panel"><p>El panel requiere una cuenta de recepci�n o administraci�n.</p><a className="button" href="#/cuenta">Ir a mi cuenta</a></div> : <>
      <form className="panel report-filter form-stack" key={params} onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        setNotice(null);
        setRange({ from: fields.get('from'), to: fields.get('to') });
        refresh(current => current + 1);
      }}>
        <p className="muted">Filtra por fecha de entrada o de actividad.</p>
        <div className="field-grid"><label>Desde<input required type="date" name="from" defaultValue={range.from} /></label>
          <label>Hasta<input required type="date" name="to" defaultValue={range.to} /></label></div>
        <div className="actions"><button className="button">Consultar historial</button>
          {role === 'admin' && <button type="button" className="button secondary" disabled={!data || downloading} onClick={download}>
            {downloading ? 'Descargando.' : 'Descargar PDF'}
          </button>}</div>
      </form>
      {notice && <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {report.error ? <p className="notice error" role="alert">{report.error.message}</p> :
        !data ? <p role="status">Consultando historial.</p> : <>
        <dl className="metrics">
          <div><dt>Reservas</dt><dd>{data.summary.count}</dd></div>
          <div><dt>Cobrado</dt><dd>{price(data.summary.received)}</dd></div>
          <div><dt>Por cobrar</dt><dd>{price(data.summary.pending)}</dd></div>
          <div><dt>Por reembolsar</dt><dd>{price(data.summary.pendingRefund)}</dd></div>
          <div><dt>Reembolsado</dt><dd>{price(data.summary.refunded)}</dd></div>
        </dl>
        <section className="panel"><h2>Historial de operaciones</h2>
          {data.rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Historial de operaciones">
            <table className="operations-table"><thead><tr><th scope="col">Reserva</th><th scope="col">Fecha</th><th scope="col">Estado</th>
              <th scope="col">Importe</th><th scope="col">Pago</th><th scope="col">Operaci�n</th></tr></thead><tbody>
              {data.rows.map(row => <tr key={row.id}><td><strong>{row.item}</strong><small>{row.code} � Cuenta {row.user_id}</small></td>
                <td>{dateLabel(row.day)}</td><td><span className={'status ' + row.booking_status}>{row.booking_status}</span></td>
                <td>{price(row.amount)}</td><td>{paymentNames[row.status]}<small>{row.method.toUpperCase()}</small></td>
                <td><PaymentActions row={row} session={session} changed={text => { setNotice({ text }); refresh(current => current + 1); }} /></td></tr>)}
              </tbody></table>
          </div> : <p>No hay operaciones para estas fechas.</p>}
        </section>
      </>}
    </>}
  </section>;
}

