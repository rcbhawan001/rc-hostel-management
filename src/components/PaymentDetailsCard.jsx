import { useEffect, useState } from "react";

import QRCode from "qrcode";

import { formatCurrency } from "../lib/formatters";
import {
  paymentInvoiceStatusKey,
  paymentInvoiceStatusLabel,
  paymentOutstandingAmount,
  pendingSubmittedAmount,
  proofStatusDisplayLabel,
  verifiedPaidCredit,
} from "../lib/paymentMath.js";
import { assertClientUploadSize, maxClientUploadLabel } from "../lib/uploadLimits.js";
import { EmptyState, StatusPill } from "./ui";

export function PaymentDetailsCard({ paymentConfig, payment, paymentForm, setPaymentForm, onSubmit, busy = false }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");

  const draftPaid = Number(String(paymentForm.submittedAmount || "").replace(/\D/g, "")) || 0;
  const billTotal = Number(payment?.totalAmount || 0);
  /** What this invoice still owes today (after verified credits, before this new proof). */
  const outstandingNow = payment ? paymentOutstandingAmount(payment) : 0;
  /** If admin approves `draftPaid` toward that balance, what would still be owed. */
  const projectedRemaining =
    payment && draftPaid > 0 ? Math.max(0, outstandingNow - draftPaid) : outstandingNow;

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(paymentConfig.upiString, {
      margin: 1,
      width: 240,
      color: {
        dark: "#24170d",
        light: "#fffaf3",
      },
    })
      .then((url) => {
        if (active) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl("");
        }
      });

    return () => {
      active = false;
    };
  }, [paymentConfig.upiString]);

  useEffect(() => {
    if (!paymentForm.paymentScreenshot) {
      setImagePreview("");
      return undefined;
    }

    if (typeof paymentForm.paymentScreenshot === "string") {
      setImagePreview(paymentForm.paymentScreenshot);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(paymentForm.paymentScreenshot);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentForm.paymentScreenshot]);

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!assertClientUploadSize(file)) {
      window.alert(`Screenshot must be ${maxClientUploadLabel()} or smaller.`);
      return;
    }

    setPaymentForm((current) => ({
      ...current,
      paymentScreenshot: file,
      paymentScreenshotName: file.name,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!Number.isFinite(draftPaid) || draftPaid < 1) {
      return;
    }
    await onSubmit({ ...paymentForm, submittedAmount: String(draftPaid) });
  }

  if (!payment) {
    return (
      <div className="payment-workspace payment-workspace--empty">
        <header className="payment-workspace-header">
          <p className="payment-workspace-eyebrow">Manual payment</p>
          <h2 className="payment-workspace-title">Pay by QR, UPI, or bank transfer</h2>
        </header>
        <div className="payment-workspace-body">
          <EmptyState title="No invoice selected" body="There is no open invoice to pay right now." />
        </div>
      </div>
    );
  }

  return (
    <div className="payment-workspace">
      <header className="payment-workspace-header">
        <p className="payment-workspace-eyebrow">Manual payment</p>
        <h2 className="payment-workspace-title">Pay by QR, UPI, or bank transfer</h2>
      </header>
      <div className="payment-workspace-body">
      <div className="payment-instructions">
        <div className="qr-card">
          {qrDataUrl ? <img src={qrDataUrl} alt="UPI QR code" /> : <div className="qr-fallback">QR</div>}
          <div>
            <p className="payment-title">{paymentConfig.qrTitle}</p>
            <strong>{paymentConfig.payeeName}</strong>
            <p>{paymentConfig.note}</p>
          </div>
        </div>

        <div className="payment-method-grid">
          <article className="payment-method-card">
            <span>UPI ID</span>
            <strong>{paymentConfig.upiId}</strong>
            <p>Pay directly in PhonePe, Google Pay, Paytm, or any UPI app.</p>
          </article>
          <article className="payment-method-card">
            <span>Bank transfer</span>
            <strong>{paymentConfig.bankName}</strong>
            <p>
              {paymentConfig.accountName}
              <br />
              A/C {paymentConfig.accountNumber}
              <br />
              IFSC {paymentConfig.ifsc}
            </p>
          </article>
        </div>

        <div className="payment-instructions-callout" role="note">
          <p>
            <strong>Pay first</strong> using the UPI ID or bank details shown above.{" "}
            <strong>Then</strong> fill in the form below and upload a screenshot of your payment confirmation so the
            office can verify it.
          </p>
        </div>
      </div>

      <div className="payment-form-summary">
        <div className="dues-pay-row">
          <span>Total bill</span>
          <strong>{formatCurrency(billTotal)}</strong>
        </div>
        {verifiedPaidCredit(payment) > 0 ? (
          <div className="dues-pay-row">
            <span>Already verified paid</span>
            <strong>{formatCurrency(verifiedPaidCredit(payment))}</strong>
          </div>
        ) : null}
        {pendingSubmittedAmount(payment) > 0 ? (
          <div className="dues-pay-row">
            <span>Submitted (under review)</span>
            <strong>{formatCurrency(pendingSubmittedAmount(payment))}</strong>
          </div>
        ) : null}
        <div className="dues-pay-row">
          <span>Remaining on bill</span>
          <strong>{formatCurrency(paymentOutstandingAmount(payment))}</strong>
        </div>
        <p className="plain-empty" style={{ marginTop: "0.35rem" }}>
          <StatusPill status={paymentInvoiceStatusKey(payment)}>{paymentInvoiceStatusLabel(payment)}</StatusPill>{" "}
          <StatusPill status={payment.proofStatus}>{proofStatusDisplayLabel(payment.proofStatus)}</StatusPill>
        </p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field-span-2 payment-form-row-2">
          <label className="payment-form-field">
            Paying for
            <input type="text" value={payment?.monthLabel || "Current dues"} readOnly />
          </label>
          <label className="payment-form-field">
            Amount you paid (₹)
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="payment-amount-input"
              value={paymentForm.submittedAmount}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                setPaymentForm((current) => ({
                  ...current,
                  submittedAmount: digits,
                }));
              }}
              placeholder={String(Math.max(0, paymentOutstandingAmount(payment)) || payment?.totalAmount || "")}
            />
          </label>
        </div>
        <div className="field-span-2">
          <p className="payment-form-hint">
            Digits only. If admin approves what you enter, it counts toward what you still owe on this bill.
            {draftPaid > 0 ? (
              <>
                {" "}
                You currently owe <strong>{formatCurrency(outstandingNow)}</strong> here; if this{" "}
                <strong>{formatCurrency(draftPaid)}</strong> payment is approved, about{" "}
                <strong>{formatCurrency(projectedRemaining)}</strong> would remain (bill total{" "}
                {formatCurrency(billTotal)}).
              </>
            ) : null}
          </p>
        </div>
        {Number(payment?.rentAmount || 0) > 0 ||
        Number(payment?.electricityAmount || 0) > 0 ||
        Number(payment?.fineAmount || 0) > 0 ||
        Number(payment?.lateFee || 0) > 0 ? (
          <div className="field-span-2 payment-bill-breakdown payment-bill-breakdown--compact">
            {Number(payment?.rentAmount || 0) > 0 ? (
              <div className="bill-line">
                <span>Rent</span>
                <strong>{formatCurrency(payment?.rentAmount || 0)}</strong>
              </div>
            ) : null}
            {Number(payment?.electricityAmount || 0) > 0 ? (
              <div className="bill-line">
                <span>Electricity</span>
                <strong>{formatCurrency(payment?.electricityAmount || 0)}</strong>
              </div>
            ) : null}
            {Number(payment?.fineAmount || 0) > 0 ? (
              <div className="bill-line">
                <span>Fine{payment?.fineReason ? ` (${payment.fineReason})` : ""}</span>
                <strong>{formatCurrency(payment?.fineAmount || 0)}</strong>
              </div>
            ) : null}
            {Number(payment?.lateFee || 0) > 0 ? (
              <div className="bill-line">
                <span>Late fee</span>
                <strong>{formatCurrency(payment?.lateFee || 0)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        <label className="field-span-2">
          UPI / bank reference number
          <input
            type="text"
            value={paymentForm.paymentReference}
            onChange={(event) =>
              setPaymentForm((current) => ({
                ...current,
                paymentReference: event.target.value,
              }))
            }
            placeholder="Example: 405672198211"
          />
        </label>
        <label className="field-span-2">
          Payment note
          <textarea
            rows="3"
            value={paymentForm.paymentNote}
            onChange={(event) =>
              setPaymentForm((current) => ({
                ...current,
                paymentNote: event.target.value,
              }))
            }
            placeholder="Optional note for admin"
          />
        </label>
        <label className="field-span-2">
          Payment screenshot
          <input type="file" accept="image/*" onChange={handleFileSelect} />
          <p className="payment-form-hint">
            Image max {maxClientUploadLabel()} (stored as WebP up to 150 KB). Uploading a new file replaces your current
            submission for this invoice. Your last file is kept once as a &quot;previous upload&quot; for admins if they
            need it.
          </p>
        </label>
        {imagePreview ? (
          <div className="field-span-2 upload-preview upload-preview--payment">
            <img src={imagePreview} alt="Payment proof preview" />
          </div>
        ) : null}
        <div className="field-span-2 payment-proof-status">
          <div>
            <span>Proof status</span>
            <StatusPill status={payment?.proofStatus || "not-submitted"}>
              {proofStatusDisplayLabel(payment?.proofStatus)}
            </StatusPill>
          </div>
          <div>
            <span>Remaining after verified credits</span>
            <strong>{formatCurrency(paymentOutstandingAmount(payment))}</strong>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Please wait…" : "Submit payment proof"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
