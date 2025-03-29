import React, { useState, useEffect, useRef, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { ACTIONS } from "../../Actions";

const Editor = ({ code, setCode, socketRef, roomId }) => {
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [iframeKey, setIframeKey] = useState(0);
  const editorRef = useRef(null);
  const isUpdatingFromSocket = useRef(false);

  // Handle Local Code Change
  const handleCodeChange = useCallback(
    (value) => {
      if (isUpdatingFromSocket.current) {
        isUpdatingFromSocket.current = false;
        return;
      }
      setCode(value);
      if (socketRef.current) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, code: value });
      }
    },
    [socketRef, roomId]
  );

  // Debounce Code Execution
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedCode(code), 500);
    return () => clearTimeout(handler);
  }, [code]);

  // Listen for Code Changes from Socket
  useEffect(() => {
    if (!socketRef.current) return;

    const handleCodeChange = ({ code }) => {
      isUpdatingFromSocket.current = true;
      setCode(code);
    };

    socketRef.current.on(ACTIONS.CODE_CHANGE, handleCodeChange);

    return () => {
      socketRef.current.off(ACTIONS.CODE_CHANGE, handleCodeChange);
    };
  }, [socketRef]);

  // Auto-update iframe only when debounced code changes
  useEffect(() => {
    const timeout = setTimeout(
      () => setIframeKey((prevKey) => prevKey + 1),
      300
    );
    return () => clearTimeout(timeout);
  }, [debouncedCode]);

  return (
    <div className="w-full h-full p-4 bg-black text-white">
      {/* Code Editor */}
      <CodeMirror
        value={code}
        height="300px"
        extensions={[javascript()]}
        theme={oneDark}
        onChange={handleCodeChange}
        onCreateEditor={(editor) => (editorRef.current = editor)}
      />

      {/* Live Preview */}
      <div className="mt-4">
        <h2 className="text-lg font-bold">Live Preview:</h2>
        <iframe
          key={iframeKey}
          title="output"
          className="w-full h-64 border border-gray-600"
          srcDoc={`
            <html>
              <head>
                <style>
                  body { background: black; color: white; font-family: Arial, sans-serif; padding: 10px; }
                  .error { color: #FF4C4C; font-weight: bold; }
                  .log { color: #00FF00; font-weight: bold; }
                </style>
              </head>
              <body>
                <div id="console"></div>
                <script>
                  (function() {
                    const consoleDiv = document.getElementById('console');
                    const originalLog = console.log;
                    const originalError = console.error;

                    console.log = function(...args) {
                      const logElement = document.createElement('p');
                      logElement.className = 'log';
                      logElement.textContent = 'Console: ' + args.join(' ');
                      consoleDiv.appendChild(logElement);
                      originalLog.apply(console, args);
                    };

                    console.error = function(...args) {
                      const errorElement = document.createElement('p');
                      errorElement.className = 'error';
                      errorElement.textContent = 'JS Error: ' + args.join(' ');
                      consoleDiv.appendChild(errorElement);
                      originalError.apply(console, args);
                    };

                    try {
                      eval(\`${debouncedCode.replace(/`/g, "\\`")}\`);
                    } catch (error) {
                      console.error("Error:", error.message);
                    }
                  })();
                </script>
              </body>
            </html>
          `}
        ></iframe>
      </div>
    </div>
  );
};

export default Editor;
