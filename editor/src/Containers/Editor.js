import React, { Component } from 'react';
import axios from 'axios';
import ReconnectingWebSocket from 'reconnecting-websocket';
import shareDB from 'sharedb/lib/client';
import StringBinding from '../EditorBinding/StringBinding';
import EditorComponent from '../Components/Editor/EditorComponent';
import Loader from '../Components/Loader/Loading';
import { notification } from 'antd';

const serverURL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
const websocketURL = process.env.REACT_APP_WEB_SOCKET_URL || 'ws://localhost:5000';

const boilerplateCode = {
  cpp: `#include <iostream>\n\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n`,
  python: `print("Hello, World!")\n`
};

class Editor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      title: 'Untitled Project',
      role: 'editor', // 'owner' | 'editor' | 'viewer'
      code: '',
      input: '',
      output: '',
      stderr: '',
      executionTimeMs: null,
      executionStatus: null,
      lang: 'cpp',
      editor: null,
      monaco: null,
      binding: null,
      runCodeDisabled: false,
      isLoading: true,
      editorTheme: 'vs-dark',
      versions: [],
      showVersionDrawer: false,
      members: [],
      showMembersModal: false
    };
  }

  componentDidMount() {
    const id = this.props.match.params.id;
    this.fetchProjectData(id);
  }

  getAuthConfig = () => {
    const token = localStorage.getItem('cocolabs_token');
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  };

  fetchProjectData = async (id) => {
    try {
      const config = this.getAuthConfig();
      // 1. Fetch project details and user's role from REST API with explicit auth header
      const projectRes = await axios.get(`${serverURL}/api/projects/${id}`, config);
      const project = projectRes.data.project;
      const role = projectRes.data.role || 'viewer';

      this.setState({
        title: project.title || `Room ${id.slice(0, 8)}`,
        lang: project.language || 'cpp',
        role
      });

      // 2. Fetch version history
      this.fetchVersions(id);

      // 3. Fetch members if owner
      if (role === 'owner') {
        this.fetchMembers(id);
      }

      // 4. Initialize document on backend
      await axios.post(serverURL, { id });

      // 5. Connect to ShareDB via WebSocket
      this.setupShareDB(id);
    } catch (err) {
      console.error('[Editor] Init Error:', err);
      // Fallback direct ShareDB connect
      this.setupShareDB(id);
    }
  };

  fetchVersions = async (id) => {
    try {
      const config = this.getAuthConfig();
      const res = await axios.get(`${serverURL}/api/projects/${id}/versions`, config);
      this.setState({ versions: res.data.versions || [] });
    } catch (e) {
      console.warn('[Editor] Failed to fetch versions:', e.message);
    }
  };

  fetchMembers = async (id) => {
    try {
      const config = this.getAuthConfig();
      const res = await axios.get(`${serverURL}/api/projects/${id}/members`, config);
      this.setState({ members: res.data.members || [] });
    } catch (e) {
      console.warn('[Editor] Failed to fetch members:', e.message);
    }
  };

  setupShareDB = (id) => {
    const rws = new ReconnectingWebSocket(websocketURL + '/bar');
    const connection = new shareDB.Connection(rws);
    const doc = connection.get('examples', id);

    doc.subscribe((err) => {
      if (err) {
        console.error('[ShareDB Subscribe Error]:', err);
        this.setState({ isLoading: false });
        return;
      }

      const presence = connection.getPresence('examples');
      presence.subscribe((presenceErr) => {
        if (presenceErr) console.warn('[Presence Error]:', presenceErr);
      });
      const localPresence = presence.create();

      const binding = new StringBinding(this, doc, ['content'], localPresence);
      this.setState({ binding, isLoading: false });
      binding.setup(this);

      presence.on('receive', (pId, range) => {
        if (!range || !this.state.editor || !this.state.monaco) return;
        const isPos = range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
        try {
          binding.decorations = this.state.editor.deltaDecorations(
            binding.decorations || [],
            [
              {
                range: new this.state.monaco.Range(
                  range.startLineNumber,
                  range.startColumn,
                  range.endLineNumber,
                  range.endColumn
                ),
                options: {
                  className: isPos ? 'cursor-position' : 'cursor-selection'
                }
              }
            ]
          );
          binding.range = range;
        } catch (e) {
          // ignore transient cursor errors
        }
      });
    });
  };

  editorDidMount = (editor, monaco) => {
    editor.focus();
    editor.getModel().pushEOL(0);

    let setup = true;
    editor.onDidChangeCursorSelection((e) => {
      if (setup) {
        const pos = editor.getPosition();
        editor.setSelection(new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column));
        setup = false;
        return;
      }
      if (this.state.binding && this.state.binding.localPresence) {
        this.state.binding.localPresence.submit(e.selection, (err) => {
          if (err) console.warn('[Presence Submit Error]:', err);
        });
      }
    });

    this.setState({ editor, monaco });
  };

  editorOnChange = (newValue, e) => {
    if (this.state.binding && this.state.binding._inputListener) {
      this.state.binding._inputListener(newValue, e);
    }
    this.setState({ code: newValue });
  };

  handleRun = async () => {
    if (this.state.role === 'viewer') return;
    this.setState({ runCodeDisabled: true, executionStatus: null });

    const code = this.state.editor ? this.state.editor.getValue() : this.state.code;
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();

    try {
      const response = await axios.post(
        `${serverURL}/code/run`,
        {
          code,
          input: this.state.input,
          id,
          lang: this.state.lang
        },
        config
      );

      const data = response.data;
      const stdout = data.stdout || '';
      const stderr = data.stderr || '';

      if (this.state.binding && this.state.binding._inoutListener) {
        this.state.binding._inoutListener(this.state.output, stdout, 'output');
      }

      this.setState({
        output: stdout,
        stderr: stderr,
        executionTimeMs: data.executionTimeMs,
        executionStatus: data.status || 'success',
        runCodeDisabled: false
      });
    } catch (err) {
      const errorMsg = err.response?.data?.stderr || err.message;
      this.setState({
        stderr: errorMsg,
        executionStatus: 'error',
        runCodeDisabled: false
      });
    }
  };

  handleInput = (e) => {
    const val = e.target.value;
    if (this.state.binding && this.state.binding._inoutListener) {
      this.state.binding._inoutListener(this.state.input, val, 'input');
    }
    this.setState({ input: val });
  };

  handleLang = async (value) => {
    if (this.state.role === 'viewer') return;
    const newCode = boilerplateCode[value] || '';

    // Update editor with the new language boilerplate code
    if (this.state.editor) {
      const fullRange = this.state.editor.getModel().getFullModelRange();
      this.state.editor.executeEdits('lang-change', [
        { range: fullRange, text: newCode }
      ]);
    }

    if (this.state.binding && this.state.binding._inoutListener) {
      this.state.binding._inoutListener(this.state.lang, value, 'lang');
    }

    this.setState({ lang: value, code: newCode });

    // Persist language change & boilerplate to DB
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      await axios.put(`${serverURL}/api/projects/${id}`, { language: value, currentCode: newCode }, config);
    } catch (e) {
      console.warn('[Editor] Failed to update language in DB:', e.message);
    }
  };

  handleTitleChange = (e) => {
    this.setState({ title: e.target.value });
  };

  handleTitleBlur = async () => {
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      await axios.put(`${serverURL}/api/projects/${id}`, { title: this.state.title }, config);
    } catch (e) {
      console.warn('[Editor] Failed to update title in DB:', e.message);
    }
  };

  handleSaveVersion = async () => {
    const id = this.props.match.params.id;
    const code = this.state.editor ? this.state.editor.getValue() : this.state.code;
    const config = this.getAuthConfig();

    try {
      const res = await axios.post(
        `${serverURL}/api/projects/${id}/versions`,
        {
          code,
          language: this.state.lang
        },
        config
      );
      notification.success({ message: `Version v${res.data.version.version_number} saved!` });
      this.fetchVersions(id);
    } catch (err) {
      notification.error({ message: 'Failed to save version: ' + (err.response?.data?.error || err.message) });
    }
  };

  handleRenameVersion = async (versionId, newLabel) => {
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      await axios.put(
        `${serverURL}/api/projects/${id}/versions/${versionId}`,
        { label: newLabel },
        config
      );
      notification.success({ message: 'Version renamed!' });
      this.fetchVersions(id);
    } catch (err) {
      notification.error({ message: 'Rename failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  handleDeleteVersion = async (versionId) => {
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      await axios.delete(`${serverURL}/api/projects/${id}/versions/${versionId}`, config);
      notification.success({ message: 'Version deleted!' });
      this.fetchVersions(id);
    } catch (err) {
      notification.error({ message: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  handleRestoreVersion = async (versionId) => {
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      const res = await axios.post(`${serverURL}/api/projects/${id}/versions/${versionId}/restore`, {}, config);
      const restoredCode = res.data.restoredCode;

      // Update Monaco model and trigger ShareDB OT sync
      if (this.state.editor) {
        const fullRange = this.state.editor.getModel().getFullModelRange();
        this.state.editor.executeEdits('version-restore', [
          { range: fullRange, text: restoredCode }
        ]);
      }
      this.setState({ code: restoredCode });
      notification.success({ message: res.data.message });
      this.fetchVersions(id);
      this.setState({ showVersionDrawer: false });
    } catch (err) {
      notification.error({ message: 'Restore failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  handleUpdateMemberRole = async (userId, newRole) => {
    const id = this.props.match.params.id;
    const config = this.getAuthConfig();
    try {
      await axios.put(`${serverURL}/api/projects/${id}/members/${userId}`, { role: newRole }, config);
      this.fetchMembers(id);
      notification.success({ message: 'Member role updated.' });
    } catch (err) {
      notification.error({ message: 'Failed to update role: ' + (err.response?.data?.error || err.message) });
    }
  };

  toggleVersionDrawer = () => {
    this.setState((prev) => ({ showVersionDrawer: !prev.showVersionDrawer }));
  };

  toggleMembersModal = () => {
    this.setState((prev) => ({ showMembersModal: !prev.showMembersModal }));
  };

  toggleTheme = () => {
    this.setState((prev) => ({
      editorTheme: prev.editorTheme === 'vs-dark' ? 'vs-light' : 'vs-dark'
    }));
  };

  render() {
    const {
      title,
      role,
      lang,
      code,
      input,
      output,
      stderr,
      executionTimeMs,
      executionStatus,
      runCodeDisabled,
      isLoading,
      editorTheme,
      versions,
      showVersionDrawer,
      members,
      showMembersModal
    } = this.state;

    const roomId = this.props.match.params.id;

    return (
      <React.Fragment>
        {isLoading && <Loader />}
        <EditorComponent
          title={title}
          handleTitleChange={this.handleTitleChange}
          handleTitleBlur={this.handleTitleBlur}
          roomId={roomId}
          role={role}
          lang={lang}
          code={code}
          input={input}
          output={output}
          stderr={stderr}
          executionTimeMs={executionTimeMs}
          executionStatus={executionStatus}
          runCodeDisabled={runCodeDisabled}
          readOnly={isLoading || role === 'viewer'}
          editorDidMount={this.editorDidMount}
          editorOnChange={this.editorOnChange}
          handleLang={this.handleLang}
          handleRun={this.handleRun}
          handleInput={this.handleInput}
          versions={versions}
          showVersionDrawer={showVersionDrawer}
          toggleVersionDrawer={this.toggleVersionDrawer}
          handleSaveVersion={this.handleSaveVersion}
          handleRenameVersion={this.handleRenameVersion}
          handleDeleteVersion={this.handleDeleteVersion}
          handleRestoreVersion={this.handleRestoreVersion}
          showMembersModal={showMembersModal}
          toggleMembersModal={this.toggleMembersModal}
          members={members}
          handleUpdateMemberRole={this.handleUpdateMemberRole}
          editorTheme={editorTheme}
          toggleTheme={this.toggleTheme}
        />
      </React.Fragment>
    );
  }
}

export default Editor;
