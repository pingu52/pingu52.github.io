export type CollectionEntry<CollectionName extends string = string> = {
	id: string;
	slug: string;
	body: string;
	collection: CollectionName;
	data: any;
	render: () => Promise<unknown>;
};

export async function getCollection(): Promise<never> {
	throw new Error("getCollection stub should not be called in tests.");
}
