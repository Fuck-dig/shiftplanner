import { useState } from 'react';
import { T } from '../lib/constants';
import { CURRENCIES, isKnownCurrency } from '../lib/currencies';

// A dropdown for the restaurant's currency symbol, with a free-text escape.
//
// Replaces a bare text box. The box worked, but it made the symbol a typing
// exercise repeated per restaurant, which is how one account ends up holding
// "kr", "Kr.", "DKK" and "dkk" and every total looks subtly like a different
// product.
//
// The list cannot be exhaustive, so "Other" stays. The rule for showing it is
// the VALUE rather than a mode flag: anything the list does not contain IS
// custom, so a restaurant set up before this dropdown existed opens with its
// own symbol in the text box instead of being silently rewritten to whatever
// happens to be first in the list.
const OTHER = '__other__';

export default function CurrencySelect({ value, onChange, disabled, placeholder, t }){
  // Set only by CHOOSING "Other", so the box can be empty and still be custom.
  // Without it, clearing the text would snap back to the dropdown mid-edit.
  const [chosenOther, setChosenOther] = useState(false);
  const custom = chosenOther || (!!value && !isKnownCurrency(value));

  const field = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.surfaceWarm, color: T.text,
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select
        value={custom ? OTHER : (value || '')}
        disabled={disabled}
        onChange={e => {
          if (e.target.value === OTHER) { setChosenOther(true); onChange(''); return; }
          setChosenOther(false);
          onChange(e.target.value);
        }}
        style={{ ...field, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {!value && !custom && <option value="">{placeholder || '—'}</option>}
        {CURRENCIES.map(c => (
          <option key={c.symbol} value={c.symbol}>{c.symbol} — {c.name}</option>
        ))}
        <option value={OTHER}>{t ? t('picker.currencyOther') : 'Other…'}</option>
      </select>

      {custom && (
        <input
          autoFocus
          maxLength={5}
          value={value || ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'kr'}
          style={field}
        />
      )}
    </div>
  );
}
