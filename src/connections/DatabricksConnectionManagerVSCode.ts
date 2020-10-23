import * as vscode from 'vscode';
import { Helper } from '../helpers/Helper';
import { ExportFormatsConfiguration, iWorkspaceConfiguration, iUserWorkspaceConfiguration, ThisExtension } from '../ThisExtension';
import { DatabricksConnection } from './DatabricksConnection';
import { DatabricksApiService } from '../databricksApi/databricksApiService';
import { iDatabricksConnection } from './iDatabricksConnection';
import { CloudProvider } from './_types';
import { DatabricksConnectionManager } from './DatabricksConnectionManager';

export class DatabricksConnectionManagerVSCode extends DatabricksConnectionManager{

	private _workspaceConfig: iWorkspaceConfiguration;

	constructor() {
		super();
		this._initialized = false;
		
		this.loadConnections();

		if (this.Connections.length == 0) {
			let msg: string = "No connections have been configured yet! Please add a connection via the VSCode Settings -> Databricks before proceeding!";
			ThisExtension.log(msg);
			vscode.window.showErrorMessage(msg);
		}
		else {
			if (this._workspaceConfig.lastActiveConnection == undefined) {
				this._workspaceConfig.lastActiveConnection = this._connections[0].displayName;
			}
			try {
				this.activateConnection(this._workspaceConfig.lastActiveConnection);
			} catch (error) {
				ThisExtension.log("Could not activate Connection '" + this._workspaceConfig.lastActiveConnection + "' ...");
				ThisExtension.log("Activating first available connection instead ...");
				this.activateConnection(this.Connections[0].displayName);
			}
			
		}
	}

	loadConnections(): void {
		/*
		there are 3 different areas from where Connections can be loaded from:
		1) the VSCode Workspace configuration using a list of connections in setting 'databricks.connections'
		2) the VSCode Workspace configuration using the default connection populated via the GUI. Settings 'databricks.connection.default.*'
		3) the VSCode User/Machine configuration in setting 'databricks.userWorkspaceConfigurations' for the current workspaceGuid

		1) and 2) are used to add new or update existing connections hence they have priority over 3)
		*/

		ThisExtension.log("Getting current Workspace Configuration (databricks.workspaceConfiguration) ...");
		this._workspaceConfig = ThisExtension.getConfigurationSetting<iWorkspaceConfiguration>('databricks.workspaceConfiguration', 'Workspace').value;

		if (this._workspaceConfig == undefined || this._workspaceConfig.workspaceGuid == undefined) {
			ThisExtension.log("Creating Workspace Configuration ...");
			this._workspaceConfig.workspaceGuid = Helper.newGuid();
		}

		ThisExtension.log("Loading connections array from Workspace (databricks.connections)...");
		this._connections = this.getConnectionsFromWorkspace();
		ThisExtension.log(`${this._connections.length} connection(s) loaded from Workspace!`);

		ThisExtension.log("Loading default connection from Workspace/UserSettings (databricks.connection.default.*) ...");
		let defaultConnectionFromWorkspace = this.getDefaultConnectionFromWorkspace();
		if(defaultConnectionFromWorkspace)
		{
			ThisExtension.log(`Default connection loaded from Workspace/UserSettings!`);
		}
		else
		{
			ThisExtension.log(`No Default connection found in Workspace/UserSettings!`);
		}

		ThisExtension.log("Loading connections array from UserSetting (databricks.userWorkspaceConfigurations)...");
		let connectionsFromGlobalConfig = this.getConnectionsFromGlobalConfig();
		ThisExtension.log(`${connectionsFromGlobalConfig.length} connection(s) loaded from UserSetting!`);

		if (defaultConnectionFromWorkspace != null && !this._connections.map((x) => x.displayName).includes(defaultConnectionFromWorkspace.displayName)) {
			this._connections.push(defaultConnectionFromWorkspace);
		}

		let newConnectionsFromWorkspace: DatabricksConnection[] = connectionsFromGlobalConfig.filter((x) => !(this._connections.map((y) => y.displayName).includes(x.displayName)));

		this._connections = this._connections.concat(newConnectionsFromWorkspace);

		this._initialized = true;

		this.updateUserWorkspaceConfig();
	}

	private getConnectionsFromWorkspace(): DatabricksConnection[] {
		let cons: iDatabricksConnection[] = ThisExtension.getConfigurationSetting<iDatabricksConnection[]>('databricks.connections', 'Workspace').value;

		let ret: DatabricksConnection[] = [];

		if(cons)
		{
			for (let con of cons) {
				let dbCon = new DatabricksConnection(con);
				if (dbCon.validate()) {
					ret.push(dbCon);
				}
			}
		}

		return ret;
	}

	private getDefaultConnectionFromWorkspace(): DatabricksConnection {

		let con: iDatabricksConnection = {
			displayName: ThisExtension.getConfigurationSetting('databricks.connection.default.displayName', 'Workspace').value,
			cloudProvider: ThisExtension.getConfigurationSetting<CloudProvider>('databricks.connection.default.cloudProvider', 'Workspace').value,
			apiRootUrl: ThisExtension.getConfigurationSetting('databricks.connection.default.apiRootUrl', 'Workspace').value,
			personalAccessToken: ThisExtension.getConfigurationSetting('databricks.connection.default.personalAccessToken', 'Workspace').value,
			localSyncFolder: ThisExtension.getConfigurationSetting('databricks.connection.default.localSyncFolder', 'Workspace').value,

			exportFormats: ThisExtension.getConfigurationSetting<ExportFormatsConfiguration>('databricks.connection.default.exportFormats', 'Workspace').value,
			useCodeCells: ThisExtension.getConfigurationSetting<boolean>('databricks.connection.default.useCodeCells', 'Workspace').value,
			personalAccessTokenSecure: undefined
		};

		let defaultCon: DatabricksConnection = new DatabricksConnection(con);

		if (!defaultCon.displayName || defaultCon.displayName == "" || !defaultCon.validate()) {
			return null;
		}

		return defaultCon;
	}

	private getConnectionsFromGlobalConfig(): DatabricksConnection[] {
		let currentUserWorkspaceConfig: iUserWorkspaceConfiguration = this.CurrentUserWorkspaceConfiguration;

		let ret: DatabricksConnection[] = [];

		if (currentUserWorkspaceConfig != undefined) {
			for (let con of currentUserWorkspaceConfig.connections) {
				let dbCon = new DatabricksConnection(con);
				if (dbCon.validate()) {
					ret.push(dbCon);
				}
			}

			return ret;
		}
		else {
			return [];
		}
	}

	

	private cleanConnectionsFromConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.connections', undefined, vscode.ConfigurationTarget.Workspace);
	}

	private cleanDefaultConnectionFromConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.connection.default.displayName', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.cloudProvider', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.apiRootUrl', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.personalAccessToken', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.localSyncFolder', undefined, vscode.ConfigurationTarget.Workspace);

		vscode.workspace.getConfiguration().update('databricks.connection.default.databricksConnectJars', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.pythonInterpreter', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.port', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.organizationId', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.exportFormats', undefined, vscode.ConfigurationTarget.Workspace);

		vscode.workspace.getConfiguration().update('databricks.connection.default.useCodeCells', undefined, vscode.ConfigurationTarget.Workspace);
	}

	private updateWorkspaceConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.workspaceConfiguration', this._workspaceConfig, vscode.ConfigurationTarget.Workspace);
	}

	private get CurrentWorkspaceConfiguration(): iUserWorkspaceConfiguration {
		return {
			"workspaceConfig": this._workspaceConfig,
			"connections": this.Connections
		};
	}

	private get AllGlobalWorkspaceConfigurations(): iUserWorkspaceConfiguration[] {
		let allGlobalWorkspaceConfigs: iUserWorkspaceConfiguration[] = ThisExtension.getConfigurationSetting<iUserWorkspaceConfiguration[]>('databricks.userWorkspaceConfigurations', 'Global').value;

		return allGlobalWorkspaceConfigs;
	}

	private get CurrentUserWorkspaceConfiguration(): iUserWorkspaceConfiguration {
		let allUserWorkspaceConfigs: iUserWorkspaceConfiguration[] = this.AllGlobalWorkspaceConfigurations;

		let currentUserWorkspaceConfig: iUserWorkspaceConfiguration[] = allUserWorkspaceConfigs.filter((x) => x.workspaceConfig.workspaceGuid == this._workspaceConfig.workspaceGuid);

		if (currentUserWorkspaceConfig.length == 1) {
			return currentUserWorkspaceConfig[0];
		}
		else if (currentUserWorkspaceConfig.length == 0) {
			return undefined;
		}

		throw new Error("There is an error in your User Workspace Configurations ('databricks.userWorkspaceConfigurations'). Please make sure all 'workspaceGuid' are unique!");
	}

	private updateUserWorkspaceConfig(): void {
		ThisExtension.log("Updating user setting 'databricks.userWorkspaceConfigurations' ...");
		let AllUserWorkspaceConfigurations: iUserWorkspaceConfiguration[] = this.AllGlobalWorkspaceConfigurations;
		let currentGlobalWorkspaceConfig: iUserWorkspaceConfiguration = this.CurrentWorkspaceConfiguration;

		let updatedGlobalWorkspaceConfigs: iUserWorkspaceConfiguration[] = [];

		if (currentGlobalWorkspaceConfig != undefined) {
			// get the original userWorkspaceConfigs except for the current one basically leaving all others unchanged
			updatedGlobalWorkspaceConfigs = AllUserWorkspaceConfigurations.filter((x) => x.workspaceConfig.workspaceGuid != this._workspaceConfig.workspaceGuid);
			// append the current/changed WorkspaceConfig
			updatedGlobalWorkspaceConfigs.push(this.CurrentWorkspaceConfiguration);
		}
		else {
			updatedGlobalWorkspaceConfigs = AllUserWorkspaceConfigurations;
			updatedGlobalWorkspaceConfigs.push(currentGlobalWorkspaceConfig);
		}

		let update = vscode.workspace.getConfiguration().update('databricks.userWorkspaceConfigurations', updatedGlobalWorkspaceConfigs, vscode.ConfigurationTarget.Global);
		update.then((x) =>
			ThisExtension.log("User setting 'databricks.userWorkspaceConfigurations' was updated!")
		);

		ThisExtension.log("Removing workspace settings 'databricks.*' as they have been persisted in the user settings!");
		this.cleanConnectionsFromConfig();
		this.cleanDefaultConnectionFromConfig();
	}

	async activateConnection(displayName: string): Promise<DatabricksConnection> {
		let filteredConnections: DatabricksConnection[] = this.Connections.filter((x) => x.displayName == displayName);

		if (filteredConnections.length == 1) {
			this._activeConnection = filteredConnections[0];
			this._workspaceConfig.lastActiveConnection = displayName;

			DatabricksApiService.initialize(this.ActiveConnection);

			this.updateWorkspaceConfig();

			if (this.ActiveConnection.useCodeCells) {
				vscode.workspace.getConfiguration().update("python.dataScience.codeRegularExpression", "^(# COMMAND ----------|#\\s*%%|#\\s*\\<codecell\\>|#\\s*In\\[\\d*?\\]|#\\s*In\\[ \\])", vscode.ConfigurationTarget.Workspace);
			}
			else {
				vscode.workspace.getConfiguration().update("python.dataScience.codeRegularExpression", undefined, vscode.ConfigurationTarget.Workspace);
			}

			return this._activeConnection;
		}
		else {
			let msg = "Connection with name  '" + displayName + "' could not be found!";
			ThisExtension.log(msg);
			throw new Error(msg);
		}
	}

	get ActiveConnection(): DatabricksConnection {
		return this._activeConnection;
	}

	get ActiveConnectionName(): string {
		return this.ActiveConnection.displayName;
	}

	get Connections(): DatabricksConnection[] {
		while (!this._initialized) { Helper.wait(500); }

		return this._connections;
	}
}