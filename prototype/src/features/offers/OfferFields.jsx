import { useId } from "react";
import { SelectField } from "../../components/ui/SelectField.jsx";

const opts = (items) => items.map(([value, label]) => ({ value, label }));
export function Input({ label, value, onChange, type = "text", ...rest }) {
  function commit(e) {
    const raw=e.currentTarget.value;
    if(raw===String(value??""))return;
    onChange(raw===""?null:type==="number"?Number(raw):raw);
  }
  return (
    <label className="offer-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={commit}
        {...rest}
      />
    </label>
  );
}
export function NumberField(props) {
  return (
    <Input type="number" min="0" step="0.01" placeholder="待确认" {...props} />
  );
}
export function Choice({ label, value, onChange, items }) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={opts(items)}
      viewportMenu
    />
  );
}
export function Check({ children, checked, onChange }) {
  return (
    <label className="offer-check">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
export function OptionStrip({label, value, items, onChange}) {
  const group = useId();
  return <fieldset className="offer-option-strip">
    <legend>{label}</legend>
    <div className="offer-options">{items.map(([key, text])=><label key={key}>
      <input type="radio" name={group} value={key} checked={value===key} onChange={()=>onChange(key)}/>
      <span>{text}</span>
    </label>)}</div>
  </fieldset>;
}
