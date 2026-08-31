// MCP tool name -> app logo / readable display name (shared by ToolsView and the chat tool trace).
// Real tenant tool names are verbose (e.g. 21may26_ishan_slack_ootb_send_slack_message_to), so match by substring.

export function toolLogo(name) {
  const s = String(name).toLowerCase();
  if (/slack/.test(s)) return '/logos/slack.svg';
  if (/gmail|email|\bmail\b/.test(s)) return '/logos/gmail.svg';
  if (/jira/.test(s)) return '/logos/jira.svg';
  if (/github/.test(s)) return '/logos/github.svg';
  if (/gitlab/.test(s)) return '/logos/gitlab.svg';
  if (/confluence/.test(s)) return '/logos/confluence.svg';
  if (/notion/.test(s)) return '/logos/notion.svg';
  if (/drive|gdrive/.test(s)) return '/logos/googledrive.svg';
  if (/teams/.test(s)) return '/logos/teams.svg';
  if (/outlook/.test(s)) return '/logos/microsoft.svg';
  if (/servicenow/.test(s)) return '/logos/servicenow.svg';
  if (/asana/.test(s)) return '/logos/asana.svg';
  if (/linear/.test(s)) return '/logos/linear.svg';
  if (/hubspot/.test(s)) return '/logos/hubspot.svg';
  if (/figma/.test(s)) return '/logos/figma.svg';
  if (/zoom/.test(s)) return '/logos/zoom.svg';
  if (/workday/.test(s)) return '/logos/workday.svg';
  if (/\bsap\b/.test(s)) return '/logos/sap.svg';
  if (/bigquery/.test(s)) return '/logos/bigquery.svg';
  if (/canva/.test(s)) return '/logos/canva.svg';
  if (/snowflake/.test(s)) return '/logos/snowflake.svg';
  if (/salesforce|sfdc/.test(s)) return '/logos/salesforce.svg';
  if (/agentforce/.test(s)) return '/logos/agentforce.png';
  if (/zendesk/.test(s)) return '/logos/zendesk.svg';
  if (/box\b/.test(s)) return '/logos/box.svg';
  if (/dropbox/.test(s)) return '/logos/dropbox.svg';
  if (/calendar|gcal/.test(s)) return '/logos/googlecalendar.svg';
  return '/logos/glean-logo.png'; // Glean native / generic (search / read_document / artifact / image, etc.)
}

// Japanese descriptions for known tools (overrides Glean's English description). Returns null if none.
export function toolDescriptionJa(name) {
  const s = String(name).toLowerCase();
  if (/slack/.test(s)) return 'Sends a message to a specified Slack channel or user.';
  if (/gmail/.test(s)) return 'Sends an email from Gmail.';
  if (/jira/.test(s)) return 'Creates an issue (ticket) in Jira.';
  if (/github/.test(s)) {
    if (/branch/.test(s)) return 'Creates a new branch in a GitHub repository.';
    if (/commit/.test(s)) return 'Commits files to a GitHub repository.';
    if (/body/.test(s)) return 'Updates the body of a GitHub Pull Request.';
    if (/comment/.test(s)) return 'Posts a comment on a GitHub Pull Request.';
    return 'Creates a Pull Request in GitHub.';
  }
  if (/salesforce|sfdc/.test(s)) return 'Creates or looks up opportunities, accounts, and leads in Salesforce (SFDC).';
  if (/zendesk/.test(s)) return 'Adds comments and handles Zendesk support tickets.';
  if (/teams/.test(s)) return 'Sends a message to a Microsoft Teams channel or user.';
  if (/workday/.test(s)) return 'Performs HR procedures such as leave requests in Workday.';
  if (/bigquery/.test(s)) return 'Runs SQL queries against BigQuery and retrieves the results.';
  if (/canva/.test(s)) return 'Duplicates and manipulates Canva designs.';
  if (/snowflake/.test(s)) return 'Searches and analyzes data in Snowflake (Cortex).';
  return null;
}

export function toolDisplayName(name) {
  const s = String(name).toLowerCase();
  if (/slack/.test(s)) return 'Send Slack message';
  if (/gmail|email/.test(s)) return 'Send Gmail email';
  if (/jira/.test(s)) return 'Create Jira issue';
  if (/github/.test(s)) {
    if (/branch/.test(s)) return 'Create GitHub branch';
    if (/commit/.test(s)) return 'Commit GitHub file';
    if (/body/.test(s)) return 'Update GitHub PR body';
    if (/comment/.test(s)) return 'Post GitHub PR comment';
    if (/\bpr\b|pull|creat/.test(s)) return 'Create GitHub PR';
    return 'GitHub operation';
  }
  if (/teams/.test(s)) return 'Send Teams message';
  if (/outlook/.test(s)) return 'Send Outlook email';
  if (/salesforce|sfdc/.test(s)) return 'Create Salesforce opportunity';
  if (/zendesk/.test(s)) return 'Handle Zendesk ticket';
  if (/workday/.test(s)) return 'Workday request';
  if (/bigquery/.test(s)) return 'Run BigQuery SQL';
  if (/canva/.test(s)) return 'Canva design';
  if (/snowflake/.test(s)) return 'Snowflake search';
  if (/servicenow/.test(s)) return 'ServiceNow ticket';
  if (/asana/.test(s)) return 'Create Asana task';
  if (/linear/.test(s)) return 'Create Linear issue';
  if (/hubspot/.test(s)) return 'HubSpot CRM';
  if (/figma/.test(s)) return 'View Figma design';
  if (/zoom/.test(s)) return 'Create Zoom meeting';
  if (/\bsap\b/.test(s)) return 'SAP ERP lookup';
  if (/enterprise_search|^search/.test(s)) return 'Enterprise search';
  if (/read_document/.test(s)) return 'Fetch document';
  if (/user_activity/.test(s)) return 'Fetch activity';
  if (/create_artifact/.test(s)) return 'Create artifact';
  if (/create_image/.test(s)) return 'Generate image';
  if (/edit_artifact/.test(s)) return 'Edit artifact';
  if (/knowledge_graph/.test(s)) return 'Knowledge graph';
  if (/memory/.test(s)) return 'Personal memory';
  return String(name).replace(/_/g, ' ');
}
