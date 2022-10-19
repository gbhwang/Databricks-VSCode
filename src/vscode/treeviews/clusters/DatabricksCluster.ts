import * as vscode from 'vscode';
import { DatabricksApiService } from '../../../databricksApi/databricksApiService';
import { ThisExtension } from '../../../ThisExtension';
import { ClusterState, ClusterSource } from './_types';
import { iDatabricksCluster } from './iDatabricksCluster';
import { Helper } from '../../../helpers/Helper';
import { DatabricksKernel } from '../../notebook/DatabricksKernel';
import { DatabricksClusterTreeItem } from './DatabricksClusterTreeItem';
import { DatabricksKernelManager } from '../../notebook/DatabricksKernelManager';
import { FSHelper } from '../../../helpers/FSHelper';

// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class DatabricksCluster extends DatabricksClusterTreeItem {
	private _id: string;
	private _state: ClusterState;
	private _definition: iDatabricksCluster;
	private _source: ClusterSource;

	constructor(
		definition: iDatabricksCluster,
		parent: DatabricksClusterTreeItem = null
	) {
		super("CLUSTER", definition.cluster_name, parent, vscode.TreeItemCollapsibleState.None);
		this._definition = definition;
		this._id = definition.cluster_id;
		this._state = definition.state;
		this._source = definition.cluster_source;

		super.description = this._description;
		super.tooltip = this._tooltip;
		super.contextValue = this._contextValue;
		super.iconPath = {
			light: this.getIconPath("light"),
			dark: this.getIconPath("dark")
		};
	}

	get _tooltip(): string {
		let tooltip = `NodeType: ${this.definition.node_type_id}\n` +
			`DriverNodeType: ${this.definition.driver_node_type_id}\n` +
			`SparkVersion: ${this.definition.spark_version}\n` +
			`AutoTermination: ${this.definition.autotermination_minutes} minutes\n`;

		if (this.definition.num_workers != undefined) {
			tooltip += `Num Workers: ${this.definition.num_workers}\n`;
		}
		else if (this.definition.autoscale != undefined) {
			tooltip += `AutoScale: ${this.definition.autoscale.min_workers} - ${this.definition.autoscale.max_workers} workers\n`;
		}

		return tooltip.trim();
	}

	// description is show next to the label
	get _description(): string {
		let desc: string = this.cluster_id;

		if (this.definition.custom_tags != undefined && this.definition.custom_tags.ResourceClass != undefined) {
			if (this.definition.custom_tags.ResourceClass == "Serverless") {
				desc += " (High-Concurrency, ";
			}
			else if (this.definition.custom_tags.ResourceClass == "SingleNode") {
				desc += " (SingleNode, ";
			}
			else {
				desc += " (Standard, ";
			}
		}
		else {
			desc += " (Standard, ";
		}
		return desc + this.state + ")";
	}

	// used in package.json to filter commands via viewItem == ACTIVE
	get _contextValue(): string {
		let states: string[] = [];

		if (['RUNNING', 'ERROR', 'UNKNOWN', 'PENDING'].includes(this.state)) {
			states.push("STARTED");
		}
		if (['UNKNOWN', 'RESTARTING', 'RESIZING', 'TERMINATING', 'TERMINATED'].includes(this.state)) {
			states.push("STOPPED");
		}

		if (this.NotebookKernelExists) {
			states.push("KERNEL");
		}
		else {
			states.push("NOKERNEL");
		}

		// use , as separator to allow to check for ,<value>, in package.json when condition
		return "," + states.join(",") + ",";
	}

	private getIconPath(theme: string): vscode.Uri {
		let state = (this.contextValue.includes("STOPPED") ? 'stop' : 'start');
		if (this.state == "PENDING") {
			state = "pending";
		}
		return FSHelper.joinPathSync(ThisExtension.rootUri, 'resources', theme, state + '.png');
	}

	readonly command = {
		command: 'databricksClusterItem.click', title: "Open File", arguments: [this]
	};


	get definition(): iDatabricksCluster {
		return this._definition;
	}

	get cluster_name(): string {
		return this.name;
	}

	get cluster_id(): string {
		return this._id;
	}

	get state(): ClusterState {
		if (this._state == undefined) {
			return "UNKNOWN";
		}
		return this._state;
	}

	get cluster_source(): ClusterSource {
		return this._source;
	}

	private get NotebookKernel(): DatabricksKernel {
		return DatabricksKernelManager.getNotebookKernel(this.definition);
	}

	public get NotebookKernelExists(): boolean {
		if (this.NotebookKernel) {
			return true;
		}
		return false;
	}

	private get InteractiveKernel(): DatabricksKernel {
		return DatabricksKernelManager.getNotebookKernel(this.definition);
	}

	public get InteractiveKernelExists(): boolean {
		if (this.InteractiveKernel) {
			return true;
		}
		return false;
	}

	async getChildren(): Promise<DatabricksClusterTreeItem[]> {
		return [];
	}

	static fromJson(jsonString: string): DatabricksClusterTreeItem {
		let item: iDatabricksCluster = JSON.parse(jsonString);
		return new DatabricksCluster(item);
	}

	async start(): Promise<void> {
		let response = DatabricksApiService.startCluster(this.cluster_id);

		response.then((response) => {
			Helper.showTemporaryInformationMessage(`Starting cluster ${this.label} (${this.cluster_id}) ...`);
		}, (error) => {
			vscode.window.showErrorMessage(`ERROR: ${error}`);
		});

		setTimeout(() => vscode.commands.executeCommand("databricksClusters.refresh", false), 1000);
	}

	async stop(): Promise<void> {
		let response = DatabricksApiService.stopCluster(this.cluster_id);

		response.then((response) => {
			Helper.showTemporaryInformationMessage(`Stopping cluster ${this.label} (${this.cluster_id}) ...`);
		}, (error) => {
			vscode.window.showErrorMessage(`ERROR: ${error}`);
		});

		let kernel = this.NotebookKernel;
		if (kernel) {
			kernel.disposeController();
		}

		setTimeout(() => vscode.commands.executeCommand("databricksClusters.refresh", false), 1000);
	}

	async delete(): Promise<void> {
		let confirm: string = await Helper.showInputBox("", "Confirm deletion by typeing the Cluster name '" + this.name + "' again.");

		if (!confirm || confirm != this.name) {
			ThisExtension.log("Deletion of Cluster '" + this.name + "' aborted!")
			return;
		}

		await DatabricksApiService.deleteCluster(this.cluster_id);

		setTimeout(() => vscode.commands.executeCommand("databricksClusters.refresh", false), 1000);
	}

	async showDefinition(): Promise<vscode.TextDocument> {
		return vscode.workspace.openTextDocument({ language: "json", content: JSON.stringify(this.definition, null, "\t") });
	}

	async useForSQL(): Promise<void> {
		ThisExtension.SQLClusterID = this.cluster_id;

		setTimeout(() => vscode.commands.executeCommand("databricksSQL.refresh", false), 1000);
	}

	async createKernel(logMessages: boolean = true): Promise<void> {
		DatabricksKernelManager.createKernels(this.definition, logMessages);
	}

	async restartKernel(): Promise<void> {
		DatabricksKernelManager.restartNotebookKernel(this.definition);
	}
}