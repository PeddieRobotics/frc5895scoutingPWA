"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Table, Button, Checkbox, Switch, Input, Form, Popconfirm, Typography, message, Drawer, Space, Card, Tabs, Divider } from "antd";
import useGameConfig from "@/lib/useGameConfig";
import { createCalculationFunctions } from "@/lib/calculation-engine";
import '@ant-design/v5-patch-for-react-19';
import { EditOutlined, DeleteOutlined, LockOutlined, TeamOutlined, MenuOutlined } from '@ant-design/icons';

// Recursively flatten all leaf fields from a section's fields array
function flattenFields(fields) {
  const result = [];
  for (const field of fields || []) {
    if (field.name && !['multiSelect', 'table', 'collapsible'].includes(field.type)) {
      result.push({ name: field.name, type: field.type, label: field.label || field.name });
    }
    if (field.type === 'multiSelect') {
      for (const opt of field.options || []) {
        if (opt.name) result.push({ name: opt.name, type: 'checkbox', label: opt.label || opt.name });
      }
    }
    if (field.type === 'table') {
      for (const row of field.rows || []) {
        for (const f of row.fields || []) {
          if (f.name) result.push({ name: f.name, type: f.type || 'counter', label: f.label || f.variant || f.name });
        }
      }
    }
    if (field.type === 'collapsible') {
      if (field.trigger?.name) {
        result.push({ name: field.trigger.name, type: field.trigger.type || 'checkbox', label: field.trigger.label || field.trigger.name });
      }
      result.push(...flattenFields(field.content));
    }
  }
  return result;
}

export default function Sudo() {
  const [data, setData] = useState([]);
  const [simplified, setSimplified] = useState(false);
  const [editing, setEditing] = useState({});
  const [form] = Form.useForm();
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [userTeam, setUserTeam] = useState(null);
  const [sudoMode, setSudoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [activeTab, setActiveTab] = useState("1");

  // Load active game config and derive calc functions + field lists
  const { config, gameId } = useGameConfig();

  const { calcAuto, calcTele, calcEnd, calcEPA } = useMemo(() => {
    if (!config) {
      const noop = () => 0;
      return { calcAuto: noop, calcTele: noop, calcEnd: noop, calcEPA: noop };
    }
    return createCalculationFunctions(config);
  }, [config]);

  // All unique game fields from the active config (deduplicated)
  const configFields = useMemo(() => {
    if (!config) return [];
    const fields = [];
    const seen = new Set();
    const addField = (f) => {
      if (f.name && !seen.has(f.name)) {
        seen.add(f.name);
        fields.push(f);
      }
    };
    for (const f of config.basics?.fields || []) {
      if (f.name) addField({ name: f.name, type: f.type, label: f.label || f.name });
    }
    for (const section of config.sections || []) {
      for (const f of flattenFields(section.fields)) {
        addField(f);
      }
    }
    return fields;
  }, [config]);

  // Fields grouped by section id (for mobile drawer tabs)
  const fieldsBySection = useMemo(() => {
    if (!config) return {};
    const sections = {};
    for (const section of config.sections || []) {
      sections[section.id] = flattenFields(section.fields);
    }
    return sections;
  }, [config]);

  const autoFields = useMemo(
    () => (fieldsBySection['auto'] || []).filter(f => f.type !== 'comment' && f.type !== 'text').map(f => f.name),
    [fieldsBySection]
  );
  const teleFields = useMemo(
    () => (fieldsBySection['tele'] || []).filter(f => f.type !== 'comment' && f.type !== 'text').map(f => f.name),
    [fieldsBySection]
  );
  const endFields = useMemo(
    () => (fieldsBySection['endgame'] || []).filter(f => f.type !== 'comment' && f.type !== 'text').map(f => f.name),
    [fieldsBySection]
  );
  const miscFields = useMemo(() => {
    const mainSections = new Set(['auto', 'tele', 'endgame']);
    const seen = new Set();
    const result = [];
    for (const [id, fields] of Object.entries(fieldsBySection)) {
      if (!mainSections.has(id)) {
        for (const f of fields) {
          if (f.type !== 'comment' && f.type !== 'text' && !seen.has(f.name)) {
            seen.add(f.name);
            result.push(f.name);
          }
        }
      }
    }
    return result;
  }, [fieldsBySection]);
  const commentFields = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const fields of Object.values(fieldsBySection)) {
      for (const f of fields) {
        if ((f.type === 'comment' || f.type === 'text') && !seen.has(f.name)) {
          seen.add(f.name);
          result.push(f.name);
        }
      }
    }
    return result;
  }, [fieldsBySection]);
  const generalFields = useMemo(() => {
    const basicsFields = (config?.basics?.fields || []).map(f => f.name);
    return ['scoutname', 'team', 'match', 'scoutteam', ...basicsFields];
  }, [config]);

  useEffect(() => {
    setSudoMode(window.localStorage.getItem("sudo") === "true");
  }, []);

  const toggleSudoMode = () => {
    const next = !sudoMode;
    if (next) {
      window.localStorage.setItem("sudo", "true");
    } else {
      window.localStorage.removeItem("sudo");
    }
    setSudoMode(next);
  };

  // Track screen size for responsive design
  useEffect(() => {
    const handleResize = () => {
      setMobileView(window.innerWidth < 768);
    };
    
    // Set initial value
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // define columns
  const sort = (a, b, f) => {
    if (f) {
      a = a[f];
      b = b[f];
    }
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };
  
  const startEditing = (record) => {
    setEditing({ ...editing, [record.id]: true });
    
    // Create a copy of the record to ensure proper handling of line breaks in comments
    const formValues = { ...record };
    
    // Set form values, ensuring line breaks are preserved
    form.setFieldsValue(formValues);
  };

  const cancelEditing = (record) => {
    setEditing({ ...editing, [record.id]: false });
  };

  const saveEditing = async (record) => {
    try {
      const values = await form.validateFields();
      
      // Process text fields to ensure line breaks are preserved
      Object.keys(values).forEach(key => {
        if (typeof values[key] === 'string' && key.includes('comments')) {
          // Ensure line breaks are preserved
          values[key] = values[key].replace(/\r\n/g, '\n');
        }
      });
      
      const updatedRecord = { ...record, ...values };
      
      const response = await fetch("/api/update-row", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          id: record.id, 
          data: updatedRecord,
          gameId: gameId ?? null,
          password: adminMode ? adminPassword : undefined 
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update");
      }
      
      setData(data.map(item => item.id === record.id ? updatedRecord : item));
      setEditing({ ...editing, [record.id]: false });
      message.success("Record updated successfully");
      
      if (mobileView && selectedRecord?.id === record.id) {
        setSelectedRecord(updatedRecord);
      }
    } catch (error) {
      message.error(`Error: ${error.message}`);
    }
  };

  const toggleAdminMode = async () => {
    if (!adminMode) {
      if (!adminPassword.trim()) {
        message.error("Please enter the admin password");
        return;
      }
      
      setLoading(true);
      try {
        // First verify the admin password
        const verifyResponse = await fetch("/api/verify-admin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: adminPassword }),
        });
        
        if (!verifyResponse.ok) {
          const error = await verifyResponse.json();
          throw new Error(error.error || "Invalid admin password");
        }
        
        const result = await verifyResponse.json();
        if (!result.authenticated) {
          throw new Error("Authentication failed");
        }
        
        setAdminMode(true);
        message.success("Admin mode activated - viewing all teams' data");
        
        // Now fetch all data with the admin password
        await fetchAllTeamsData();
      } catch (error) {
        message.error(`Error: ${error.message}`);
        setAdminPassword("");
      } finally {
        setLoading(false);
      }
    } else {
      setAdminMode(false);
      setAdminPassword("");
      message.info("Admin mode deactivated - only viewing your team's data");
      fetchData(false); // Refetch only team data
    }
  };

  // Special function to fetch all teams' data with admin password
  const fetchAllTeamsData = async () => {
    setLoading(true);
    try {
      // Make a direct request with the admin password in the headers
      const params = new URLSearchParams({ all: "true" });
      if (gameId) params.set("gameId", String(gameId));
      const response = await fetch(`/api/get-data?${params.toString()}`, {
        method: "GET",
        headers: {
          'Cache-Control': 'no-cache',
          'Admin-Password': adminPassword
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch all teams data");
      }
      
      const data = await response.json();
      console.log("Admin Data Fetch - Received:", data);
      
      if (!data.rows || data.rows.length === 0) {
        message.warning("No data found in the database");
        setData([]);
        return;
      }
      
      let sortedData = data.rows.sort((a, b) => {
        if (a.match > b.match) return -1;
        if (a.match < b.match) return 1;
        if (a.team > b.team) return 1;
        if (a.team < b.team) return -1;
        return a.id - b.id;
      });
      
      console.log(`Admin Mode: Got ${sortedData.length} rows of data`);
      setData(sortedData);
    } catch (error) {
      message.error(`Failed to fetch all teams data: ${error.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (fetchAll = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fetchAll) params.set("all", "true");
      if (gameId) params.set("gameId", String(gameId));
      const url = `/api/get-data${params.toString() ? `?${params.toString()}` : ""}`;
      const headers = {
        'Cache-Control': 'no-cache',
      };
      
      // Add admin password in headers when in admin mode
      if (adminMode && adminPassword) {
        headers['Admin-Password'] = adminPassword;
        console.log("Adding admin password to request");
      }
      
      console.log(`Fetching data with URL: ${url}, admin mode: ${adminMode}, fetch all: ${fetchAll}`);
      const resp = await fetch(url, { headers });
      
      if (!resp.ok) {
        throw new Error("Failed to fetch data");
      }
      
      const data = await resp.json();
      console.log("Fetched Data:", data);
      
      // Check for error messages from the API
      if (data.error) {
        message.warning(data.error);
      }
      
      // Set the user's team if included in the response
      if (data.userTeam) {
        setUserTeam(data.userTeam);
      }
      
      // If no data was returned, display appropriate message
      if (!data.rows || data.rows.length === 0) {
        if (userTeam) {
          message.info(`No data found for team ${userTeam}`);
        } else {
          message.warning("No team identified. Please login with a valid team account.");
        }
        setData([]);
        return;
      }
      
      let sortedAndColoredData = data.rows.sort((a, b) => {
        if (a.match > b.match) return -1;
        if (a.match < b.match) return 1;
        if (a.team > b.team) return 1;
        if (a.team < b.team) return -1;
        return a.id - b.id;
      });
      
      console.log(`Got ${sortedAndColoredData.length} rows of data`);
      setData(sortedAndColoredData);
    } catch (error) {
      message.error(`Error fetching data: ${error.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [gameId]);

  // Mobile drawer handlers
  const showMobileDetails = (record) => {
    setSelectedRecord(record);
    setDrawerVisible(true);
  };

  const closeMobileDetails = () => {
    setDrawerVisible(false);
    setSelectedRecord(null);
  };

  // Update the formatValue function to better handle line breaks in comments
  const formatValue = (value) => {
    if (typeof value === 'boolean') {
      return value ? "✅" : "❌";
    }
    
    // Special handling for null/undefined
    if (value === undefined || value === null) {
      return "-";
    }
    
    // For comments, preserve the original string without modification
    return value;
  };

  // Delete record function
  const deleteRecord = async (record) => {
    try {
      const response = await fetch("/api/delete-row", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          id: record.id, 
          gameId: gameId ?? null,
          password: adminMode ? adminPassword : undefined 
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }
      
      message.success("Record deleted successfully");
      setData(data.filter((dp) => dp.id != record.id));
      
      if (mobileView && selectedRecord?.id === record.id) {
        setDrawerVisible(false);
        setSelectedRecord(null);
      }
    } catch (error) {
      message.error(`Error: ${error.message}`);
    }
  };

  let columns = [
    {
      title: "ScoutName",
      dataIndex: "scoutname",
      key: "scoutname",
      width: 120,
      fixed: "left",
      simple: true,
      sorter: (a, b) => sort(a, b, "scoutname"),
      editable: true,
    },
    {
      title: "Team",
      dataIndex: "team",
      key: "team",
      width: 80,
      fixed: "left",
      simple: true,
      sorter: (a, b) => sort(a, b, "team"),
      editable: true,
    },
    {
      title: config?.usePPR ? "PPR" : "EPA",
      key: "EPA",
      render: (text, rec) => {
        return <>{calcEPA(rec)}</>;
      },
      sorter: (a, b) => sort(calcEPA(a), calcEPA(b)),
      width: 100,
      fixed: "left",
      simple: true,
    },
    {
      title: "Match",
      dataIndex: "match",
      key: "match",
      width: 100,
      simple: true,
      sorter: (a, b) => sort(a, b, "match"),
      editable: true,
    },
    {
      title: "ScoutTeam",
      dataIndex: "scoutteam",
      key: "scoutteam",
      width: 100,
      editable: true,
      simple: true,
      sorter: (a, b) => sort(a, b, "scoutteam"),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => {
        const isEditing = editing[record.id];
        
        if (mobileView) {
          return (
            <Button type="primary" size="small" onClick={() => showMobileDetails(record)}>
              <MenuOutlined />
            </Button>
          );
        }
        
        return isEditing ? (
          <Space>
            <Button 
              type="primary" 
              size="small" 
              onClick={() => saveEditing(record)}
            >
              Save
            </Button>
            <Button 
              size="small" 
              onClick={() => cancelEditing(record)}
            >
              Cancel
            </Button>
          </Space>
        ) : (
          <Space>
            <Button 
              type="primary" 
              size="small" 
              onClick={() => startEditing(record)}
              icon={<EditOutlined />}
            />
            <Popconfirm
              title="Delete this record?"
              description="This cannot be undone."
              onConfirm={() => deleteRecord(record)}
            >
              <Button 
                danger 
                size="small" 
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Space>
        );
      },
      width: 120,
      fixed: "left",
    },

    {
      title: "AUTO",
      key: "auto",
      render: (text, record) => {
        let auto = calcAuto(record);
        return <>{auto}</>;
      },
      sorter: (a, b) => sort(calcAuto(a), calcAuto(b)),
      simple: true,
      width: 100,
    },
    {
      title: "TELE",
      key: "tele",
      render: (text, record) => {
        let tele = calcTele(record);
        return <>{tele}</>;
      },
      sorter: (a, b) => sort(calcTele(a), calcTele(b)),
      simple: true,
      width: 100,
    },
    {
      title: "END",
      key: "end",
      render: (text, record) => {
        let end = calcEnd(record);
        return <>{end}</>;
      },
      sorter: (a, b) => sort(calcEnd(a), calcEnd(b)),
      simple: true,
      width: 100,
    },
    {
      title: "Breakdown",
      dataIndex: config?.display?.apiAggregation?.breakdownField || "breakdown",
      key: "breakdown_indicator",
      render: (value) => value ? <>💥</> : <>✅</>,
      simple: true,
    },
    ...configFields,
  ].map((element) => {
    // Pre-built column objects (have a `title` property)
    if (typeof element === "object" && 'title' in element) return element;
    // Dynamic field objects: { name, type, label }
    const fieldName = element.name;
    const fieldLabel = element.label || fieldName;
    const isComment = element.type === 'comment' || element.type === 'text';
    if (isComment) {
      return {
        title: fieldLabel,
        dataIndex: fieldName,
        key: fieldName,
        ellipsis: true,
        editable: true,
        render: (text, record) => {
          const isEditing = editing[record.id];
          if (isEditing) {
            return (
              <Form.Item name={fieldName} style={{ margin: 0 }}>
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 20 }}
                  style={{ width: '100%' }}
                  maxLength={255}
                  showCount
                  placeholder="Enter comments here..."
                />
              </Form.Item>
            );
          }
          return (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {text}
            </div>
          );
        }
      };
    }
    return {
      title: fieldLabel,
      dataIndex: fieldName,
      key: fieldName,
      render: (text, record) => {
        const isEditing = editing[record.id];
        if (isEditing) {
          return (
            <Form.Item
              name={fieldName}
              style={{ margin: 0 }}
              valuePropName={typeof text === 'boolean' ? 'checked' : 'value'}
            >
              {typeof text === 'boolean' ? <Checkbox /> : <Input />}
            </Form.Item>
          );
        }
        let visibleValue = text;
        if (typeof text === 'boolean') {
          visibleValue = text ? "✅" : "❌";
        }
        let style = {};
        if (text === 0) {
          style = { color: "red" };
        }
        return <div style={style}>{visibleValue}</div>;
      },
      sorter: (a, b) => sort(a, b, fieldName),
      editable: true,
    };
  });

  // For mobile view, limit columns
  if (mobileView) {
    columns = columns.filter(col => 
      ['scoutname', 'team', 'match', 'EPA', 'actions', 'scoutteam', 'auto', 'tele', 'end'].some(
        key => col.key?.toLowerCase().includes(key.toLowerCase()) || 
              col.dataIndex?.toLowerCase().includes(key.toLowerCase())
      )
    );
  }

  columns = columns.map((col) => {
    let hidden = false;
    if (simplified && col.simple != true) hidden = true;
    return { ...col, hidden };
  });

  const mergedColumns = columns.map(col => {
    if (!col.editable) {
      return col;
    }

    return {
      ...col,
      onCell: record => ({
        record,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: editing[record.id],
      }),
    };
  });

  // Render the mobile detail drawer
  const renderMobileDetailDrawer = () => (
    <Drawer
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Team {selectedRecord?.team} - Match {selectedRecord?.match}</span>
          <Space>
            {!editing[selectedRecord?.id] && (
              <>
                <Button 
                  type="primary" 
                  onClick={() => startEditing(selectedRecord)}
                  icon={<EditOutlined />}
                  size="small"
                >
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this record?"
                  description="This cannot be undone."
                  onConfirm={() => deleteRecord(selectedRecord)}
                >
                  <Button 
                    danger 
                    size="small" 
                    icon={<DeleteOutlined />}
                  >
                    Delete
                  </Button>
                </Popconfirm>
              </>
            )}
            {editing[selectedRecord?.id] && (
              <>
                <Button 
                  type="primary" 
                  onClick={() => saveEditing(selectedRecord)}
                  size="small"
                >
                  Save
                </Button>
                <Button 
                  onClick={() => cancelEditing(selectedRecord)}
                  size="small"
                >
                  Cancel
                </Button>
              </>
            )}
          </Space>
        </div>
      }
      placement="bottom"
      height="90vh"
      onClose={closeMobileDetails}
      open={drawerVisible}
      styles={{
        body: { padding: '12px', overflowY: 'auto' }
      }}
    >
      {selectedRecord && (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: "1",
            label: "General",
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Card size="small" title="Main Info">
                  <Form form={form} component={false}>
                    {generalFields.map(field => (
                      <div key={field} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        borderBottom: '1px solid #f0f0f0', 
                        padding: '8px 0' 
                      }}>
                        <span style={{ fontWeight: 'bold' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                        {editing[selectedRecord.id] ? (
                          <Form.Item 
                            name={field} 
                            style={{ margin: 0 }}
                            valuePropName={typeof selectedRecord[field] === 'boolean' ? 'checked' : 'value'}
                          >
                            {typeof selectedRecord[field] === 'boolean' ? (
                              <Checkbox />
                            ) : (
                              <Input style={{ width: '150px' }} />
                            )}
                          </Form.Item>
                        ) : (
                          <span>{formatValue(selectedRecord[field])}</span>
                        )}
                      </div>
                    ))}
                  </Form>
                </Card>
                
                <Card size="small" title="Scores">
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    borderBottom: '1px solid #f0f0f0', 
                    padding: '8px 0' 
                  }}>
                    <span style={{ fontWeight: 'bold' }}>Auto</span>
                    <span>{calcAuto(selectedRecord)}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    borderBottom: '1px solid #f0f0f0', 
                    padding: '8px 0' 
                  }}>
                    <span style={{ fontWeight: 'bold' }}>Tele</span>
                    <span>{calcTele(selectedRecord)}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    borderBottom: '1px solid #f0f0f0', 
                    padding: '8px 0' 
                  }}>
                    <span style={{ fontWeight: 'bold' }}>End</span>
                    <span>{calcEnd(selectedRecord)}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '8px 0',
                    fontWeight: 'bold'
                  }}>
                    <span>{config?.usePPR ? "PPR" : "EPA"}</span>
                    <span>{calcEPA(selectedRecord)}</span>
                  </div>
                </Card>
              </div>
            )
          },
          {
            key: "2",
            label: "Auto",
            children: (
              <Card size="small" title="Auto Period">
                <Form form={form} component={false}>
                  {autoFields.map(field => (
                    <div key={field} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      borderBottom: '1px solid #f0f0f0', 
                      padding: '8px 0' 
                    }}>
                      <span style={{ fontWeight: 'bold' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                      {editing[selectedRecord.id] ? (
                        <Form.Item 
                          name={field} 
                          style={{ margin: 0 }}
                          valuePropName={typeof selectedRecord[field] === 'boolean' ? 'checked' : 'value'}
                        >
                          {typeof selectedRecord[field] === 'boolean' ? (
                            <Checkbox />
                          ) : (
                            <Input style={{ width: '150px' }} />
                          )}
                        </Form.Item>
                      ) : (
                        <span>{formatValue(selectedRecord[field])}</span>
                      )}
                    </div>
                  ))}
                </Form>
              </Card>
            )
          },
          {
            key: "3",
            label: "Tele",
            children: (
              <Card size="small" title="Tele Period">
                <Form form={form} component={false}>
                  {teleFields.map(field => (
                    <div key={field} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      borderBottom: '1px solid #f0f0f0', 
                      padding: '8px 0' 
                    }}>
                      <span style={{ fontWeight: 'bold' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                      {editing[selectedRecord.id] ? (
                        <Form.Item 
                          name={field} 
                          style={{ margin: 0 }}
                          valuePropName={typeof selectedRecord[field] === 'boolean' ? 'checked' : 'value'}
                        >
                          {typeof selectedRecord[field] === 'boolean' ? (
                            <Checkbox />
                          ) : (
                            <Input style={{ width: '150px' }} />
                          )}
                        </Form.Item>
                      ) : (
                        <span>{formatValue(selectedRecord[field])}</span>
                      )}
                    </div>
                  ))}
                </Form>
              </Card>
            )
          },
          {
            key: "4",
            label: "End",
            children: (
              <Card size="small" title="End Period">
                <Form form={form} component={false}>
                  {endFields.map(field => (
                    <div key={field} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      borderBottom: '1px solid #f0f0f0', 
                      padding: '8px 0' 
                    }}>
                      <span style={{ fontWeight: 'bold' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                      {editing[selectedRecord.id] ? (
                        <Form.Item 
                          name={field} 
                          style={{ margin: 0 }}
                          valuePropName={typeof selectedRecord[field] === 'boolean' ? 'checked' : 'value'}
                        >
                          {typeof selectedRecord[field] === 'boolean' ? (
                            <Checkbox />
                          ) : (
                            <Input style={{ width: '150px' }} />
                          )}
                        </Form.Item>
                      ) : (
                        <span>{formatValue(selectedRecord[field])}</span>
                      )}
                    </div>
                  ))}
                </Form>
              </Card>
            )
          },
          {
            key: "5",
            label: "Misc",
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Card size="small" title="Misc Statistics">
                  <Form form={form} component={false}>
                    {miscFields.map(field => (
                      <div key={field} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        borderBottom: '1px solid #f0f0f0', 
                        padding: '8px 0' 
                      }}>
                        <span style={{ fontWeight: 'bold' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                        {editing[selectedRecord.id] ? (
                          <Form.Item 
                            name={field} 
                            style={{ margin: 0 }}
                            valuePropName={typeof selectedRecord[field] === 'boolean' ? 'checked' : 'value'}
                          >
                            {typeof selectedRecord[field] === 'boolean' ? (
                              <Checkbox />
                            ) : (
                              <Input style={{ width: '150px' }} />
                            )}
                          </Form.Item>
                        ) : (
                          <span>{formatValue(selectedRecord[field])}</span>
                        )}
                      </div>
                    ))}
                  </Form>
                </Card>
                
                <Card size="small" title="Comments">
                  <Form form={form} component={false}>
                    {commentFields.map(field => (
                      <div key={field} style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        borderBottom: '1px solid #f0f0f0', 
                        padding: '8px 0' 
                      }}>
                        <span style={{ fontWeight: 'bold', marginBottom: '5px' }}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                        {editing[selectedRecord.id] ? (
                          <Form.Item 
                            name={field} 
                            style={{ margin: 0 }}
                          >
                            <Input.TextArea 
                              autoSize={{ minRows: 2, maxRows: 20 }}
                              style={{ width: '100%' }}
                              maxLength={255}
                              showCount
                              placeholder="Enter comments here..."
                            />
                          </Form.Item>
                        ) : (
                          <div 
                            style={{ 
                              whiteSpace: 'pre-wrap', 
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word' 
                            }}
                          >
                            {formatValue(selectedRecord[field])}
                          </div>
                        )}
                      </div>
                    ))}
                  </Form>
                </Card>
              </div>
            )
          }
        ]} />
      )}
    </Drawer>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: mobileView ? "100%" : "90vw",
          margin: "auto",
          padding: mobileView ? "10px" : 0,
        paddingTop: mobileView ? "50px" : "60px"
        }}
      >
        <div style={{ 
          display: "flex", 
          flexDirection: mobileView ? "column" : "row",
          gap: mobileView ? "10px" : "20px", 
          alignItems: mobileView ? "stretch" : "center", 
          marginBottom: "20px",
          width: "100%"
        }}>
          <div style={{ 
            display: "flex", 
            flexDirection: mobileView ? "row" : undefined,
            justifyContent: mobileView ? "space-between" : undefined,
            alignItems: "center",
            gap: "10px"
          }}>
            <Switch
              checkedChildren="Simple View"
              unCheckedChildren="Complex View"
              onChange={setSimplified}
            />
            <Button
              type={sudoMode ? "primary" : "default"}
              danger={sudoMode}
              onClick={toggleSudoMode}
              icon={<LockOutlined />}
            >
              {sudoMode ? "Revoke Sudo" : "Get Sudo"}
            </Button>
            
            {userTeam && (
              <div style={{ fontWeight: 'bold' }}>
                {adminMode ? 
                  <span style={{ 
                    color: 'green', 
                    backgroundColor: '#f0fff0', 
                    padding: '5px 10px', 
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <LockOutlined /> {!mobileView && "Admin Mode"}
                  </span> : 
                  <span style={{ 
                    color: '#0050b3', 
                    backgroundColor: '#e6f7ff', 
                    padding: '5px 10px', 
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <TeamOutlined /> {!mobileView ? `Team ${userTeam}` : userTeam}
                  </span>
                }
              </div>
            )}
          </div>
          
          <div suppressHydrationWarning style={{
            display: "flex",
            gap: "10px",
            flexGrow: 1,
            justifyContent: mobileView ? "space-between" : "flex-end"
          }}>
            <Input.Password
              placeholder="Admin Password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{ width: mobileView ? "60%" : 200 }}
              disabled={adminMode}
            />
            <Button 
              type={adminMode ? "default" : "primary"}
              onClick={toggleAdminMode}
              style={{ width: mobileView ? "37%" : undefined }}
            >
              {adminMode ? "Exit Admin" : "Admin Mode"}
            </Button>
          </div>
        </div>
        
        <Form form={form} component={false}>
          <Table
            components={{
              body: {
                cell: EditableCell,
              },
            }}
            columns={mergedColumns}
            dataSource={data}
            scroll={{ x: true }}
            loading={loading}
            rowKey="id"
            pagination={{ 
              position: ['bottomCenter'],
              showSizeChanger: !mobileView,
              defaultPageSize: mobileView ? 10 : 20
            }}
            size={mobileView ? "small" : "middle"}
            style={{ 
              width: '100%', 
              fontSize: mobileView ? '0.85rem' : '1rem'
            }}
          />
        </Form>
        
        {mobileView && renderMobileDetailDrawer()}
      </div>
    </div>
  );
}

const EditableCell = ({
  editing,
  dataIndex,
  title,
  record,
  children,
  ...restProps
}) => {
  // Determine if this is a comment field that needs a TextArea
  const isCommentField = dataIndex && dataIndex.includes('comments');
  
  // Create appropriate input based on field type
  let inputNode;
  
  if (typeof record?.[dataIndex] === 'boolean') {
    inputNode = <Checkbox />;
  } else if (isCommentField) {
    inputNode = (
      <Input.TextArea 
        autoSize={{ minRows: 2, maxRows: 20 }}
        style={{ width: '100%' }}
        maxLength={255}
        showCount
        placeholder="Enter comments here..."
      />
    );
  } else {
    inputNode = <Input />;
  }
  
  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{
            margin: 0,
            marginBottom: isCommentField ? '32px' : 0, // Add extra space for comment fields with counter
          }}
          valuePropName={typeof record?.[dataIndex] === 'boolean' ? 'checked' : 'value'}
        >
          {inputNode}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};
