"use client";
import TextInput from "./TextInput";
import Checkbox from "./Checkbox";
import CommentBox from "./CommentBox";
import Qualitative from "./Qualitative";
import SelectInput from "./SelectInput";

export default function DynamicField({ field, prefix = "", state, setState }) {
  const name = `${prefix}${field.name}`;
  const handleChange = (e) => {
    const value = field.type === 'checkbox' ? e.target.checked : e.target.value;
    setState(prev => ({ ...prev, [field.name]: value }));
  };

  if (field.dependsOn && !state[field.dependsOn]) {
    return null;
  }

  switch (field.type) {
    case 'text':
    case 'number':
      return (
        <TextInput
          visibleName={field.label}
          internalName={name}
          type={field.type === 'number' ? 'number' : 'text'}
          value={state[field.name] || field.default || ""}
          changeListener={handleChange}
        />
      );
    case 'checkbox':
      return (
        <Checkbox
          visibleName={field.label}
          internalName={name}
          changeListener={handleChange}
          defaultChecked={state[field.name] || false}
        />
      );
    case 'comment':
      return (
        <CommentBox
          visibleName={field.label}
          internalName={name}
          defaultValue={state[field.name] || ""}
          changeListener={handleChange}
        />
      );
    case 'qualitative':
      return (
        <Qualitative
          visibleName={field.label}
          internalName={name}
          changeListener={handleChange}
        />
      );
    case 'select':
      return (
        <SelectInput
          visibleName={field.label}
          internalName={name}
          options={field.options}
          value={state[field.name] || field.default || ""}
          changeListener={handleChange}
        />
      );
    default:
      return null;
  }
}
