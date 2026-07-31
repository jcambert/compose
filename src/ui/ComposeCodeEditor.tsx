import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';

type Props = {
  value: string;
  height: string;
  language: 'yaml' | 'env';
  editable: boolean;
  className?: string;
  onChange: (value: string) => void;
};

export function ComposeCodeEditor({
  value,
  height,
  language,
  editable,
  className,
  onChange,
}: Props) {
  return (
    <CodeMirror
      className={className === undefined ? 'compose-code-editor' : 'compose-code-editor ' + className}
      value={value}
      height={height}
      theme={oneDark}
      extensions={language === 'yaml' ? [yamlLanguage()] : []}
      editable={editable}
      basicSetup={{
        lineNumbers: true,
        foldGutter: language === 'yaml',
        bracketMatching: language === 'yaml',
      }}
      onChange={onChange}
    />
  );
}
